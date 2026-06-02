// ═══════════════════════════════════════════════════════
// matcher.js — Motor de Matching do Buscapet (Prisma)
//
// 4 momentos de execução:
//  1. POST /api/pets          → matchForNewPet()
//  2. PUT  /api/pets/:id      → matchForUpdatedPet()
//  3. Cron job (a cada 1h)   → runFullMatch()
//  4. POST /api/matches/run  → runFullMatch() (manual)
// ═══════════════════════════════════════════════════════
const prisma = require('./lib/prisma');

const WEIGHTS   = { species:35, breed:25, size:20, color:15, location:15, date:10, gender:10 };
const THRESHOLD = 40;

// ── Helpers ────────────────────────────────────────────
function tok(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[\s,\-/]+/).filter(w => w.length >= 4);
}

function calcScore(lost, found) {
  let s = 0;
  // Espécie — eliminatório
  if (lost.species && found.species) {
    if (lost.species !== found.species) return 0;
    s += WEIGHTS.species;
  }
  // Raça — exata ou parcial
  if (lost.breed && found.breed) {
    const a = lost.breed.toLowerCase(), b = found.breed.toLowerCase();
    s += a === b ? 25 : (a.includes(b) || b.includes(a)) ? 15 : 0;
  }
  // Porte
  if (lost.size && found.size && lost.size === found.size)
    s += WEIGHTS.size;
  // Cor — tokenização
  if (lost.color && found.color) {
    const aw = tok(lost.color), bw = tok(found.color);
    if (aw.some(w => bw.includes(w))) s += WEIGHTS.color;
  }
  // Localização — tokenização
  if (lost.location && found.location) {
    const aw = tok(lost.location), bw = tok(found.location);
    if (aw.some(w => bw.includes(w))) s += WEIGHTS.location;
  }
  // Data — bonus por proximidade
  if (lost.date && found.date) {
    const d = Math.abs(new Date(lost.date) - new Date(found.date)) / 86400000;
    if (d <= 30) s += 10;
    if (d <= 7)  s += 5;
  }
  // Sexo
  if (lost.gender && found.gender && lost.gender === found.gender)
    s += WEIGHTS.gender;

  return Math.min(Math.round(s / 135 * 100), 100);
}

// ── MOMENTO 1: matching para pet recém-cadastrado ──────
async function matchForNewPet(newPetId) {
  const pet = await prisma.pet.findUnique({ where: { id: newPetId } });
  if (!pet) return { created: 0, updated: 0 };

  const oppositeType = pet.type === 'lost' ? 'found' : 'lost';
  const candidates = await prisma.pet.findMany({
    where: {
      type:   oppositeType,
      status: { in: ['active', 'matched'] },
      id:     { not: newPetId },
    },
  });

  return _saveMatches(pet, candidates);
}

// ── MOMENTO 2: re-matching após edição de campos relevantes
async function matchForUpdatedPet(petId) {
  // Remove matches antigos e reseta status
  await prisma.match.deleteMany({
    where: { OR: [{ lost_pet_id: petId }, { found_pet_id: petId }] },
  });
  await prisma.pet.updateMany({
    where:  { id: petId, status: 'matched' },
    data:   { status: 'active' },
  });
  return matchForNewPet(petId);
}

// ── MOMENTO 3 e 4: full match completo ────────────────
async function runFullMatch(triggerType = 'cron') {
  const start = Date.now();
  let totalCreated = 0, totalUpdated = 0;

  const [lostPets, foundPets] = await Promise.all([
    prisma.pet.findMany({ where: { type: 'lost',  status: { in: ['active', 'matched'] } } }),
    prisma.pet.findMany({ where: { type: 'found', status: { in: ['active', 'matched'] } } }),
  ]);

  for (const l of lostPets) {
    const r = await _saveMatches(l, foundPets);
    totalCreated += r.created;
    totalUpdated += r.updated;
  }

  // Registra execução no log
  await prisma.matchRun.create({
    data: {
      trigger_type:    triggerType,
      lost_count:      lostPets.length,
      found_count:     foundPets.length,
      new_matches:     totalCreated,
      updated_matches: totalUpdated,
      duration_ms:     Date.now() - start,
    },
  });

  return { created: totalCreated, updated: totalUpdated };
}

// ── Interno: persiste matches com upsert ──────────────
async function _saveMatches(pet, candidates) {
  let created = 0, updated = 0;

  for (const c of candidates) {
    const lostPet  = pet.type === 'lost'  ? pet : c;
    const foundPet = pet.type === 'found' ? pet : c;

    const score = calcScore(lostPet, foundPet);
    if (score < THRESHOLD) continue;

    // Upsert: cria se não existir, atualiza score se mudou
    const existing = await prisma.match.findUnique({
      where: {
        lost_pet_id_found_pet_id: {
          lost_pet_id:  lostPet.id,
          found_pet_id: foundPet.id,
        },
      },
    });

    if (!existing) {
      await prisma.match.create({
        data: {
          lost_pet_id:  lostPet.id,
          found_pet_id: foundPet.id,
          score,
          status: 'active',
        },
      });
      created++;
    } else if (existing.score !== score) {
      await prisma.match.update({
        where: { id: existing.id },
        data:  { score, status: 'active' },
      });
      updated++;
    }

    // Atualiza status dos pets para 'matched'
    await prisma.pet.updateMany({
      where: { id: { in: [lostPet.id, foundPet.id] }, status: 'active' },
      data:  { status: 'matched' },
    });
  }

  return { created, updated };
}

// ── Campos que disparam re-matching quando editados ────
const MATCH_FIELDS = new Set(['species', 'breed', 'color', 'size', 'gender', 'date', 'location']);
function hasRelevantChange(fields) {
  return Object.keys(fields).some(k => MATCH_FIELDS.has(k));
}

module.exports = {
  calcScore,
  matchForNewPet,
  matchForUpdatedPet,
  runFullMatch,
  hasRelevantChange,
  THRESHOLD,
  WEIGHTS,
};
