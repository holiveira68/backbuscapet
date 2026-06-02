// ═══════════════════════════════════════════════════════
// BUSCAPET API — server.js (Prisma Edition)
// Node.js 18+ | Express | Prisma | MySQL
//
// npm install
// npm run db:push    → sincroniza schema com o banco
// npm run db:seed    → insere dados de exemplo
// npm start          → inicia a API na porta 3001
// ═══════════════════════════════════════════════════════
require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const cron     = require('node-cron');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const prisma   = require('./lib/prisma');
const { matchForNewPet, matchForUpdatedPet, runFullMatch, hasRelevantChange } = require('./matcher');

const app         = express();
const PORT        = process.env.PORT       || 3001;
const JWT_SECRET  = process.env.JWT_SECRET || 'buscapet-dev-secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES|| '7d';

// ── Middleware ─────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use((req, _, next) => {
  console.log(`${new Date().toLocaleTimeString('pt-BR')} ${req.method} ${req.path}`);
  next();
});

// ── Testa conexão com o banco ao iniciar ───────────────
prisma.$connect()
  .then(() => console.log('✅ Prisma conectado ao MySQL'))
  .catch(e  => console.error('❌ Prisma:', e.message));

// ── Auth Middleware ────────────────────────────────────
function authMW(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Token não fornecido' });
  try {
    req.user = jwt.verify(h.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

// ── Formata campos públicos do usuário ─────────────────
function fmtUser(u) {
  return {
    id: u.id, first_name: u.first_name, last_name: u.last_name,
    email: u.email, phone: u.phone, city: u.city,
    avatar_url: u.avatar_url, created_at: u.created_at,
  };
}

// ══════════════════════════════════════════════════════
// AUTH ROUTES
// ══════════════════════════════════════════════════════

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  const { first_name, last_name, email, phone, city, password } = req.body;
  if (!first_name || !last_name || !email || !password)
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Senha deve ter mínimo 8 caracteres' });
  try {
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (existing) return res.status(409).json({ error: 'E-mail já cadastrado' });

    const hash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        first_name: first_name.trim(),
        last_name:  last_name.trim(),
        email:      email.toLowerCase(),
        phone:      phone ? (phone.replace(/\D/g, '') || null) : null,
        city:       city || null,
        password_hash: hash,
      },
    });
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.status(201).json({ message: 'Conta criada!', token, user: fmtUser(user) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno' }); }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Informe e-mail e senha' });
  try {
    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase(), active: true },
    });
    if (!user) return res.status(401).json({ error: 'E-mail ou senha incorretos' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok)  return res.status(401).json({ error: 'E-mail ou senha incorretos' });

    await prisma.user.update({
      where: { id: user.id },
      data:  { login_attempts: 0, last_login: new Date() },
    });
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ message: `Bem-vindo, ${user.first_name}!`, token, user: fmtUser(user) });
  } catch (e) { res.status(500).json({ error: 'Erro interno' }); }
});

// GET /api/auth/me
app.get('/api/auth/me', authMW, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json(fmtUser(user));
});

// PUT /api/auth/me
app.put('/api/auth/me', authMW, async (req, res) => {
  const { first_name, last_name, phone, city } = req.body;
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data:  {
      first_name,
      last_name,
      phone: phone ? (phone.replace(/\D/g, '') || null) : null,
      city,
    },
  });
  res.json({ message: 'Perfil atualizado', user: fmtUser(user) });
});

// POST /api/auth/change-password
app.post('/api/auth/change-password', authMW, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ error: 'Informe as senhas' });
  if (new_password.length < 8)
    return res.status(400).json({ error: 'Senha muito curta' });

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const ok   = await bcrypt.compare(current_password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Senha atual incorreta' });

  const hash = await bcrypt.hash(new_password, 12);
  await prisma.user.update({
    where: { id: req.user.id },
    data:  { password_hash: hash },
  });
  res.json({ message: 'Senha alterada!' });
});

// POST /api/auth/forgot-password
app.post('/api/auth/forgot-password', async (req, res) => {
  const ok = { message: 'Se o e-mail existir, você receberá o link.' };
  const { email } = req.body;
  if (!email) return res.json(ok);
  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user) return res.json(ok);

    const token  = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 3600000); // 1 hora
    await prisma.user.update({
      where: { id: user.id },
      data:  { reset_token: token, reset_token_expiry: expiry },
    });
    console.log(`[Reset] ${email} → token: ${token}`);
  } catch {}
  res.json(ok);
});

// GET /api/auth/check-email
app.get('/api/auth/check-email', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Informe e-mail' });
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  res.json({ available: !user });
});

// GET /api/auth/my-pets Status not resolved vai trazer apenas os pets ativos e do próprio usuário (Helder 29.05.26)
app.get('/api/auth/my-pets', authMW, async (req, res) => {
  const pets = await prisma.pet.findMany({
    where:   { user_id: req.user.id, status: { not: 'resolved' } },
    orderBy: { created_at: 'desc' },
    include: {
      _count: {
        select: {
          matches_as_lost:  { where: { status: 'active' } },
          matches_as_found: { where: { status: 'active' } },
        },
      },
    },
  });
  // Normaliza o count de matches
  const result = pets.map(p => ({
    ...p,
    match_count: p._count.matches_as_lost + p._count.matches_as_found,
    _count: undefined,
  }));
  res.json({ pets: result });
});

// ══════════════════════════════════════════════════════
// PETS ROUTES
// ══════════════════════════════════════════════════════

// GET /api/pets
app.get('/api/pets', async (req, res) => {
  try {
    const { type, species, size, gender, search } = req.query;

    // Monta filtros dinamicamente
    const where = { status: { not: 'resolved' } };
    if (type)    where.type    = type;
    if (species) where.species = species;
    if (size)    where.size    = size;
    if (gender)  where.gender  = gender;
    if (search) {
      where.OR = [
        { name:        { contains: search } },
        { breed:       { contains: search } },
        { color:       { contains: search } },
        { location:    { contains: search } },
        { description: { contains: search } },
      ];
    }

    const pets = await prisma.pet.findMany({
      where,
      orderBy: { created_at: 'desc' },
    });

    // Stats globais
    const [lostCount, foundCount, matchCount] = await Promise.all([
      prisma.pet.count({ where: { type: 'lost',  status: { not: 'resolved' } } }),
      prisma.pet.count({ where: { type: 'found', status: { not: 'resolved' } } }),
      prisma.match.count({ where: { status: 'active' } }),
    ]);

    // Marca pets que têm matches ativos
    const activeMatchPetIds = await prisma.match.findMany({
      where:  { status: 'active' },
      select: { lost_pet_id: true, found_pet_id: true },
    });
    const matchedSet = new Set();
    activeMatchPetIds.forEach(m => {
      matchedSet.add(m.lost_pet_id);
      matchedSet.add(m.found_pet_id);
    });

    res.json({
      pets:  pets.map(p => ({ ...p, matched: matchedSet.has(p.id) })),
      stats: { lost: lostCount, found: foundCount, matches: matchCount },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/pets/:id
app.get('/api/pets/:id', async (req, res) => {
  const pet = await prisma.pet.findUnique({
    where: { id: parseInt(req.params.id) },
  });
  if (!pet) return res.status(404).json({ error: 'Pet não encontrado' });

  const matches = await prisma.match.findMany({
    where: {
      OR: [
        { lost_pet_id:  pet.id },
        { found_pet_id: pet.id },
      ],
      status: 'active',
    },
    orderBy: { score: 'desc' },
  });
  res.json({ ...pet, matches });
});

// POST /api/pets — MOMENTO 1: matching automático no cadastro
app.post('/api/pets', authMW, async (req, res) => {
  const {
    type, name, species, breed, color, size, gender,
    date, location, description, owner_name, owner_phone, owner_email, photo,
  } = req.body;

  if (!type || !species || !color || !size || !location || !owner_name || !owner_phone || !owner_email)
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });

  try {
    // Cria o pet
    const pet = await prisma.pet.create({
      data: {
        type,
        user_id:     req.user.id,
        name:        name        || null,
        species,
        breed:       breed       || null,
        color,
        size,
        gender:      gender      || null,
        date:        date        ? new Date(date) : null,
        location,
        description: description || null,
        owner_name,
        owner_phone: owner_phone ? (owner_phone.replace(/\D/g, '') || null) : null,
        owner_email,
        photo:       photo       || null,
        status:      'active',
      },
    });

    // MOMENTO 1 — matching imediato
    const result = await matchForNewPet(pet.id);

    res.status(201).json({
      id:      pet.id,
      matches: result.created,
      message: result.created > 0
        ? `🎉 ${result.created} match(es) encontrado(s)!`
        : 'Cadastrado! Avisaremos se aparecer um match.',
    });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// PUT /api/pets/:id — MOMENTO 2: re-matching se campos relevantes mudaram
app.put('/api/pets/:id', authMW, async (req, res) => {
  const fields = req.body;
  if (!Object.keys(fields).length)
    return res.status(400).json({ error: 'Nenhum campo enviado' });

  try {
    // Converte date para Date se vier como string
    if (fields.date) fields.date = new Date(fields.date);
    // Remove campos que não existem no modelo
    const { id: _id, user_id: _uid, created_at: _ca, ...updateData } = fields;

    await prisma.pet.update({
      where: { id: parseInt(req.params.id), user_id: req.user.id },
      data:  updateData,
    });

    let reMatch = null;
    if (hasRelevantChange(fields)) {
      reMatch = await matchForUpdatedPet(parseInt(req.params.id));
    }
    res.json({ message: 'Atualizado', re_match: reMatch });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/pets/:id
app.delete('/api/pets/:id', authMW, async (req, res) => {
  try {
    const petId = parseInt(req.params.id);

    // Arquiva o pet
    await prisma.pet.update({
      where: { id: petId, user_id: req.user.id },
      data:  { status: 'resolved' },
    });

    // Arquiva matches ativos relacionados
    await prisma.match.updateMany({
      where: {
        OR: [{ lost_pet_id: petId }, { found_pet_id: petId }],
        status: 'active',
      },
      data: { status: 'resolved', confirmed_at: new Date() },
    });

    res.json({ message: '🎉 Reencontrado!' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════
// MATCHES ROUTES
// ══════════════════════════════════════════════════════

// GET /api/matches
app.get('/api/matches', async (req, res) => {
  const minScore = parseInt(req.query.min_score || 40);

  const matches = await prisma.match.findMany({
    where: {
      status: 'active',
      score:  { gte: minScore },
    },
    include: {
      lost_pet:  true,
      found_pet: true,
    },
    orderBy: [
      { score:      'desc' },
      { created_at: 'desc' },
    ],
  });

  // Formata para o mesmo contrato da API anterior
  const formatted = matches.map(m => ({
    match_id:      m.id,
    score:         m.score,
    match_status:  m.status,
    match_created: m.created_at,
    // campos do pet perdido
    lost_id:       m.lost_pet.id,
    lost_name:     m.lost_pet.name,
    lost_species:  m.lost_pet.species,
    lost_breed:    m.lost_pet.breed,
    lost_color:    m.lost_pet.color,
    lost_size:     m.lost_pet.size,
    lost_gender:   m.lost_pet.gender,
    lost_date:     m.lost_pet.date,
    lost_location: m.lost_pet.location,
    lost_owner:    m.lost_pet.owner_name,
    lost_phone:    m.lost_pet.owner_phone,
    lost_email:    m.lost_pet.owner_email,
    lost_photo:    m.lost_pet.photo,
    // campos do pet achado
    found_id:       m.found_pet.id,
    found_name:     m.found_pet.name,
    found_species:  m.found_pet.species,
    found_breed:    m.found_pet.breed,
    found_color:    m.found_pet.color,
    found_size:     m.found_pet.size,
    found_gender:   m.found_pet.gender,
    found_date:     m.found_pet.date,
    found_location: m.found_pet.location,
    found_owner:    m.found_pet.owner_name,
    found_phone:    m.found_pet.owner_phone,
    found_email:    m.found_pet.owner_email,
    found_photo:    m.found_pet.photo,
  }));

  res.json({ matches: formatted, total: formatted.length });
});

// GET /api/matches/pet/:id
app.get('/api/matches/pet/:id', async (req, res) => {
  const petId = parseInt(req.params.id);
  const matches = await prisma.match.findMany({
    where: {
      OR: [{ lost_pet_id: petId }, { found_pet_id: petId }],
      status: 'active',
    },
    include: { lost_pet: true, found_pet: true },
    orderBy: { score: 'desc' },
  });
  res.json({ matches, total: matches.length });
});

// PATCH /api/matches/:id/confirm
app.patch('/api/matches/:id/confirm', authMW, async (req, res) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: parseInt(req.params.id) },
    });
    if (!match) return res.status(404).json({ error: 'Match não encontrado' });

    // Confirma match e arquiva os dois pets em paralelo
    await Promise.all([
      prisma.match.update({
        where: { id: match.id },
        data:  { status: 'confirmed', confirmed_at: new Date() },
      }),
      prisma.pet.updateMany({
        where: { id: { in: [match.lost_pet_id, match.found_pet_id] } },
        data:  { status: 'resolved' },
      }),
    ]);
    res.json({ message: '🎉 Reencontro confirmado!' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/matches/:id/dismiss
app.patch('/api/matches/:id/dismiss', authMW, async (req, res) => {
  await prisma.match.update({
    where: { id: parseInt(req.params.id) },
    data:  { status: 'dismissed' },
  });
  res.json({ message: 'Match descartado' });
});

// POST /api/matches/run — MOMENTO 4: full match manual (admin)
app.post('/api/matches/run', async (req, res) => {
  if (req.headers['x-admin-key'] !== (process.env.ADMIN_KEY || 'buscapet-admin'))
    return res.status(403).json({ error: 'Não autorizado' });
  try {
    const result = await runFullMatch('manual');
    res.json({ message: 'Full match concluído!', ...result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/matches/history
app.get('/api/matches/history', async (req, res) => {
  const history = await prisma.matchRun.findMany({
    orderBy: { ran_at: 'desc' },
    take: 50,
  });
  res.json({ history });
});

// GET /api/health
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const lastRun = await prisma.matchRun.findFirst({
      orderBy: { ran_at: 'desc' },
    });
    res.json({
      status:    'ok',
      db:        'connected',
      orm:       'prisma',
      last_cron: lastRun?.ran_at || null,
    });
  } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
});

// ── Cron — MOMENTO 3: full match a cada hora ──────────
cron.schedule('0 * * * *', async () => {
  console.log('\n[CRON] ⏰ Full match automático...');
  try {
    const r = await runFullMatch('cron');
    console.log(`[CRON] ✅ +${r.created} novos, ${r.updated} atualizados\n`);
  } catch (e) { console.error('[CRON] ❌', e.message); }
});

// ── Graceful shutdown ──────────────────────────────────
process.on('SIGINT',  async () => { await prisma.$disconnect(); process.exit(0); });
process.on('SIGTERM', async () => { await prisma.$disconnect(); process.exit(0); });

app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║  🐾  BUSCAPET API (Prisma) — porta ${PORT} ║`);
  console.log(`║  Health: GET /api/health             ║`);
  console.log(`║  ORM:    Prisma 5                    ║`);
  console.log(`║  Cron:   a cada 1 hora               ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
});

module.exports = app;
