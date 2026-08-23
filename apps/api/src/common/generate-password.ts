import { randomInt } from "node:crypto";

// Sin vocales ni caracteres que se confundan al dictar o copiar (0/O, 1/l/I).
const CONSONANTS = "bcdfghjkmnpqrstvwxz";
const DIGITS = "23456789";

/**
 * Genera una contraseña legible para entregarle a una persona.
 *
 * Se muestra una sola vez en pantalla al crear o resetear el usuario: la
 * plataforma guarda únicamente el hash, así que después no hay forma de volver
 * a verla y hay que generar una nueva.
 */
export function generatePassword(): string {
  const block = (length: number, alphabet: string) =>
    Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join("");

  return `${block(4, CONSONANTS)}-${block(4, CONSONANTS)}-${block(4, DIGITS)}`;
}
