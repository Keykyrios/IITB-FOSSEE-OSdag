import argon2 from 'argon2';

const ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 1,
};

// Pre-computed hash of a throwaway string. Used by the login route to run
// argon2.verify even when the email doesn't match any account, so that the
// response time is indistinguishable from a wrong-password attempt.
export const DUMMY_HASH = await argon2.hash('__dummy__', ARGON2_OPTS);

export async function hashPassword(plain) {
  return argon2.hash(plain, ARGON2_OPTS);
}

export async function verifyPassword(hash, plain) {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
