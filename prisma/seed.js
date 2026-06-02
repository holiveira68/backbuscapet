// ═══════════════════════════════════════════════════════
// prisma/seed.js — Dados de exemplo para desenvolvimento
// Executar com: node prisma/seed.js
// ═══════════════════════════════════════════════════════
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');

async function main() {
  console.log('🌱 Iniciando seed...');

  // Usuário demo
  const hash = await bcrypt.hash('Demo@123', 12);
  const demo = await prisma.user.upsert({
    where:  { email: 'demo@buscapet.com' },
    update: {},
    create: {
      first_name:     'Demo',
      last_name:      'User',
      email:          'demo@buscapet.com',
      phone:          '11999999999',
      city:           'São Paulo, SP',
      password_hash:  hash,
      active:         true,
      email_verified: true,
    },
  });
  console.log('✅ Usuário demo criado:', demo.email);

  // Pets de exemplo
  const petsData = [
    { type:'lost',  name:'Rex',  species:'cachorro', breed:'Golden Retriever', color:'Dourado',       size:'grande',  gender:'macho', date:new Date('2025-03-10'), location:'Vila Madalena, SP', description:'Usa coleira azul. Muito dócil.',           owner_name:'Carlos Silva',    owner_phone:'11991234567', owner_email:'carlos@email.com' },
    { type:'found', name:null,   species:'cachorro', breed:'Golden Retriever', color:'Caramelo',      size:'grande',  gender:'macho', date:new Date('2025-03-11'), location:'Pinheiros, SP',     description:'Encontrado perto do metrô.',              owner_name:'Ana Souza',       owner_phone:'11987654321', owner_email:'ana@email.com'    },
    { type:'lost',  name:'Mia',  species:'gato',     breed:'Siamês',           color:'Creme/Escuro',  size:'pequeno', gender:'fêmea', date:new Date('2025-03-08'), location:'Jardins, SP',       description:'Olhos azuis. Tem microchip.',             owner_name:'Beatriz Lima',    owner_phone:'11955551234', owner_email:'bea@email.com'    },
    { type:'found', name:null,   species:'gato',     breed:'SRD',              color:'Laranja/Branco',size:'pequeno', gender:'macho', date:new Date('2025-03-12'), location:'Moema, SP',         description:'Encontrado na rua, assustado.',           owner_name:'Pedro Costa',     owner_phone:'11944440987', owner_email:'pedro@email.com'  },
    { type:'lost',  name:'Bob',  species:'cachorro', breed:'Labrador',         color:'Preto',         size:'grande',  gender:'macho', date:new Date('2025-03-13'), location:'Lapa, SP',          description:'Adora bola. Usa coleira preta.',          owner_name:'Mariana Alves',   owner_phone:'11933330765', owner_email:'mari@email.com'   },
    { type:'found', name:null,   species:'pássaro',  breed:'Calopsita',        color:'Cinza/Amarelo', size:'pequeno', gender:null,    date:new Date('2025-03-14'), location:'Santana, SP',       description:'Pousou na janela. Parece bem cuidado.',   owner_name:'Lucas Ferreira',  owner_phone:'11922220543', owner_email:'lucas@email.com'  },
    { type:'lost',  name:'Luna', species:'gato',     breed:'Persa',            color:'Branco',        size:'pequeno', gender:'fêmea', date:new Date('2025-03-15'), location:'Moema, SP',         description:'Pelos longos. Muito tímida.',             owner_name:'Fernando Costa',  owner_phone:'11977778888', owner_email:'fern@email.com'   },
    { type:'found', name:null,   species:'gato',     breed:'Persa',            color:'Branco',        size:'pequeno', gender:'fêmea', date:new Date('2025-03-16'), location:'Moema, SP',         description:'Gata branca com pelos longos no jardim.', owner_name:'Camila Ramos',    owner_phone:'11966661234', owner_email:'cami@email.com'   },
  ];

  for (const p of petsData) {
    await prisma.pet.create({ data: { ...p, user_id: demo.id, status: 'active' } });
  }
  console.log(`✅ ${petsData.length} pets de exemplo criados`);
  console.log('\n🎉 Seed concluído!');
  console.log('   Login demo: demo@buscapet.com / Demo@123');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
