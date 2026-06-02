// ═══════════════════════════════════════════════════════
// lib/prisma.js — Singleton do Prisma Client
// Evita múltiplas instâncias em desenvolvimento (hot-reload)
// ═══════════════════════════════════════════════════════
const { PrismaClient } = require('@prisma/client');

const globalForPrisma = global;

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = basePrisma;
}

function mapValueInput(val) {
  if (val === 'médio') return 'medio';
  if (val === 'fêmea') return 'femea';
  return val;
}

function mapValueOrArrayInput(val) {
  if (typeof val === 'string') {
    return mapValueInput(val);
  }
  if (Array.isArray(val)) {
    return val.map(mapValueInput);
  }
  if (val && typeof val === 'object') {
    const res = {};
    for (const k of Object.keys(val)) {
      res[k] = mapValueOrArrayInput(val[k]);
    }
    return res;
  }
  return val;
}

function isPlainObject(val) {
  if (val === null || typeof val !== 'object') return false;
  const proto = Object.getPrototypeOf(val);
  return proto === null || proto === Object.prototype;
}

function mapObjectInput(obj) {
  if (Array.isArray(obj)) {
    return obj.map(mapObjectInput);
  }

  if (!isPlainObject(obj)) {
    return obj;
  }

  const res = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (key === 'size' || key === 'gender') {
      res[key] = mapValueOrArrayInput(val);
    } else if (typeof val === 'object' && val !== null) {
      res[key] = mapObjectInput(val);
    } else {
      res[key] = val;
    }
  }
  return res;
}

const extendedPrisma = basePrisma.$extends({
  result: {
    pet: {
      size: {
        needs: { size: true },
        compute(pet) {
          return pet.size === 'medio' ? 'médio' : pet.size;
        }
      },
      gender: {
        needs: { gender: true },
        compute(pet) {
          return pet.gender === 'femea' ? 'fêmea' : pet.gender;
        }
      }
    }
  }
});

// Proxy to intercept input arguments on pet operations before validation runs
const petProxy = new Proxy(extendedPrisma.pet, {
  get(target, prop, receiver) {
    const originalMethod = Reflect.get(target, prop, receiver);
    if (typeof originalMethod === 'function') {
      return function(...args) {
        if (args[0]) {
          if (args[0].where) {
            args[0].where = mapObjectInput(args[0].where);
          }
          if (args[0].data) {
            args[0].data = mapObjectInput(args[0].data);
          }
          if (args[0].create) {
            args[0].create = mapObjectInput(args[0].create);
          }
          if (args[0].update) {
            args[0].update = mapObjectInput(args[0].update);
          }
        }
        return originalMethod.apply(target, args);
      };
    }
    return originalMethod;
  }
});

const prisma = new Proxy(extendedPrisma, {
  get(target, prop, receiver) {
    if (prop === 'pet') {
      return petProxy;
    }
    return Reflect.get(target, prop, receiver);
  }
});

module.exports = prisma;
