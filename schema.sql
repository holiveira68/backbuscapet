-- ════════════════════════════════════════════
-- BUSCAPET — schema.sql  (v3)
-- MySQL 8+   |   utf8mb4
-- Execute: mysql -u root -p < schema.sql
-- ════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS buscapet
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE buscapet;

-- ─────────────────────────────────────────────
-- TABELA: users
-- Contas de usuários cadastrados no Buscapet
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                 INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  first_name         VARCHAR(80)   NOT NULL,
  last_name          VARCHAR(80)   NOT NULL,
  email              VARCHAR(150)  NOT NULL,
  phone              VARCHAR(25)   DEFAULT NULL,
  city               VARCHAR(100)  DEFAULT NULL,
  password_hash      VARCHAR(255)  NOT NULL  COMMENT 'bcrypt hash',
  avatar_url         VARCHAR(500)  DEFAULT NULL,
  active             TINYINT(1)    NOT NULL DEFAULT 1,
  login_attempts     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  reset_token        VARCHAR(64)   DEFAULT NULL,
  reset_token_expiry DATETIME      DEFAULT NULL,
  email_verified     TINYINT(1)    NOT NULL DEFAULT 0,
  last_login         DATETIME      DEFAULT NULL,
  created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME      DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_email (email),
  INDEX idx_reset (reset_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- TABELA: pets
-- Animais perdidos e achados
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pets (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  type        ENUM('lost','found') NOT NULL COMMENT 'lost=perdido, found=achado',
  user_id     INT UNSIGNED  NOT NULL         COMMENT 'Usuário que cadastrou',

  -- Características (usadas no matching)
  name        VARCHAR(100)  DEFAULT NULL,
  species     VARCHAR(50)   NOT NULL,
  breed       VARCHAR(100)  DEFAULT NULL,
  color       VARCHAR(100)  NOT NULL,
  size        ENUM('pequeno','médio','grande') NOT NULL,
  gender      ENUM('macho','fêmea')  DEFAULT NULL,
  date        DATE          DEFAULT NULL,
  location    VARCHAR(255)  NOT NULL,
  description TEXT          DEFAULT NULL,

  -- Contato do responsável
  owner_name  VARCHAR(150)  NOT NULL,
  owner_phone VARCHAR(25)   NOT NULL,
  owner_email VARCHAR(150)  NOT NULL,
  photo       LONGTEXT      DEFAULT NULL,

  -- Ciclo de vida: active → matched → resolved
  status      ENUM('active','matched','resolved') NOT NULL DEFAULT 'active',

  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_type         (type),
  INDEX idx_status       (status),
  INDEX idx_user         (user_id),
  INDEX idx_species      (species),
  INDEX idx_size         (size),
  INDEX idx_date         (date),
  INDEX idx_type_status  (type, status),
  FULLTEXT INDEX ft_search (name, breed, color, location, description),

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- TABELA: matches
-- Pares (perdido × achado) com score 0-100
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS matches (
  id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  lost_pet_id  INT UNSIGNED  NOT NULL,
  found_pet_id INT UNSIGNED  NOT NULL,
  score        TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0-100',
  -- active → confirmado → descartado → resolvido
  status       ENUM('active','confirmed','dismissed','resolved') NOT NULL DEFAULT 'active',
  confirmed_at DATETIME      DEFAULT NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME      DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_pair (lost_pet_id, found_pet_id),
  INDEX idx_score  (score DESC),
  INDEX idx_status (status),
  INDEX idx_lost   (lost_pet_id),
  INDEX idx_found  (found_pet_id),

  FOREIGN KEY (lost_pet_id)  REFERENCES pets(id) ON DELETE CASCADE,
  FOREIGN KEY (found_pet_id) REFERENCES pets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- TABELA: match_runs
-- Log de execuções do motor de matching
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS match_runs (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  trigger_type    ENUM('cron','manual','startup') NOT NULL DEFAULT 'cron',
  lost_count      INT UNSIGNED  NOT NULL DEFAULT 0,
  found_count     INT UNSIGNED  NOT NULL DEFAULT 0,
  new_matches     INT UNSIGNED  NOT NULL DEFAULT 0,
  updated_matches INT UNSIGNED  NOT NULL DEFAULT 0,
  duration_ms     INT UNSIGNED  DEFAULT NULL,
  ran_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_ran (ran_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- VIEW: v_matches_full
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW v_matches_full AS
SELECT
  m.id match_id, m.score, m.status match_status,
  m.created_at match_created,
  lp.id lost_id,   lp.name lost_name,   lp.species lost_species,
  lp.breed lost_breed, lp.color lost_color, lp.size lost_size,
  lp.gender lost_gender, lp.date lost_date, lp.location lost_location,
  lp.owner_name lost_owner, lp.owner_phone lost_phone, lp.owner_email lost_email,
  lp.photo lost_photo,
  fp.id found_id,  fp.name found_name,  fp.species found_species,
  fp.breed found_breed, fp.color found_color, fp.size found_size,
  fp.gender found_gender, fp.date found_date, fp.location found_location,
  fp.owner_name found_owner, fp.owner_phone found_phone, fp.owner_email found_email,
  fp.photo found_photo
FROM matches m
JOIN pets lp ON m.lost_pet_id  = lp.id
JOIN pets fp ON m.found_pet_id = fp.id;

-- ─────────────────────────────────────────────
-- DADOS DE EXEMPLO
-- ─────────────────────────────────────────────
-- Usuário demo (senha: Demo@123)
INSERT INTO users (first_name, last_name, email, phone, city, password_hash, active, email_verified)
VALUES ('Demo', 'User', 'demo@buscapet.com', '11999999999', 'Caraguatatuba, SP',
        '$2a$12$LQv3c1yqBwElGk4m5Dz7cOjmBfRvvt7yRK1AUF3pLKa5MzF8TXf.a', 1, 1)
ON DUPLICATE KEY UPDATE id=id;

-- Pets de exemplo (vinculados ao usuário id=1)
INSERT INTO pets (type, user_id, name, species, breed, color, size, gender, date, location, description, owner_name, owner_phone, owner_email)
VALUES
  ('lost',  1,'Rex',   'cachorro','Golden Retriever','Dourado',       'grande', 'macho', '2025-03-10','Vila Madalena, São Paulo','Usa coleira azul. Muito dócil.',              'Carlos Silva',   '11991234567','carlos@email.com'),
  ('found', 1, NULL,   'cachorro','Golden Retriever','Caramelo',      'grande', 'macho', '2025-03-11','Pinheiros, São Paulo',    'Encontrado perto do metrô.',                 'Ana Souza',      '11987654321','ana@email.com'),
  ('lost',  1,'Mia',   'gato',    'Siamês',          'Creme/Escuro',  'pequeno','fêmea', '2025-03-08','Jardins, São Paulo',      'Olhos azuis. Tem microchip.',                'Beatriz Lima',   '11955551234','bea@email.com'),
  ('found', 1, NULL,   'gato',    'SRD',             'Laranja/Branco','pequeno','macho', '2025-03-12','Moema, São Paulo',        'Encontrado na rua, assustado.',              'Pedro Costa',    '11944440987','pedro@email.com'),
  ('lost',  1,'Bob',   'cachorro','Labrador',         'Preto',        'grande', 'macho', '2025-03-13','Lapa, São Paulo',         'Adora bola. Usa coleira preta.',             'Mariana Alves',  '11933330765','mari@email.com'),
  ('found', 1, NULL,   'pássaro', 'Calopsita',        'Cinza/Amarelo','pequeno', NULL,   '2025-03-14','Santana, São Paulo',      'Pousou na janela. Parece bem cuidado.',     'Lucas Ferreira', '11922220543','lucas@email.com'),
  ('lost',  1,'Luna',  'gato',    'Persa',            'Branco',       'pequeno','fêmea', '2025-03-15','Moema, São Paulo',        'Pelos longos. Muito tímida.',                'Fernando Costa', '11977778888','fern@email.com'),
  ('found', 1, NULL,   'gato',    'Persa',            'Branco',       'pequeno','fêmea', '2025-03-16','Moema, São Paulo',        'Gata branca com pelos longos.',              'Camila Ramos',   '11966661234','cami@email.com');
