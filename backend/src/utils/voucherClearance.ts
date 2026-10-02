/**
 * Cheque clearance (Voucher.isCleared):
 * - null / undefined → non-cheque voucher (always posts to books)
 * - 0 Pending → does not post
 * - 1 Cleared / Receive → posts
 * - 2 Returned → does not post
 * - 3 Cancelled → does not post
 */

export function isClearedForBalance(
  isCleared: number | null | undefined,
): boolean {
  return isCleared === null || isCleared === undefined || isCleared === 1;
}

/** Prisma filter: vouchers that should affect ledgers / financial statements. */
export const VOUCHER_CLEARED_FOR_BALANCE_OR = [
  { isCleared: null },
  { isCleared: 1 },
] as const;

export const voucherClearedForBalanceWhere = {
  OR: [...VOUCHER_CLEARED_FOR_BALANCE_OR],
};
