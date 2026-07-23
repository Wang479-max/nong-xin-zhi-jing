import type { PasswordResetInput, UserRegistrationInput } from './repository';
import { SaasDomainError } from './types';

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/;

export function validateUserRegistrationInput(input: UserRegistrationInput): void {
  if (!('email' in input)) return;
  if (!EMAIL_SHAPE.test(input.email.trim())) invalidIdentityInput();
  if (input.displayName.trim().length === 0) invalidIdentityInput();
  if (input.passwordHash.trim().length === 0) invalidIdentityInput();
  if (!validIsoTimestamp(input.emailVerifiedAt)) invalidIdentityInput();
}

export function validatePasswordResetInput(input: PasswordResetInput): void {
  if (input.userId.trim().length === 0) invalidIdentityInput();
  if (input.passwordHash.trim().length === 0) invalidIdentityInput();
  if (!validIsoTimestamp(input.revokedAt)) invalidIdentityInput();
}

function validIsoTimestamp(value: string): boolean {
  const match = value.match(ISO_TIMESTAMP);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , offset] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  if (offset !== 'Z') {
    const [offsetHour, offsetMinute] = offset.slice(1).split(':').map(Number);
    if (offsetHour > 23 || offsetMinute > 59) return false;
  }
  return true;
}

function invalidIdentityInput(): never {
  throw new SaasDomainError('VALIDATION_ERROR', 'Identity input is invalid.');
}
