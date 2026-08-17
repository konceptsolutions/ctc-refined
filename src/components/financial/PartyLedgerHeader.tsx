import { MapPin, Phone, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { balanceValueClass } from "@/utils/accountingColors";

export type LedgerContactPerson = {
  name?: string | null;
  designation?: string | null;
  contactNumber?: string | null;
};

export type LedgerPartyDetails = {
  type?: "customer" | "supplier" | string | null;
  name?: string | null;
  contactPerson?: string | null;
  contactPersons?: LedgerContactPerson[] | null;
  address?: string | null;
  phone?: string | null;
};

const dash = (value?: string | null) => {
  const text = String(value || "").trim();
  return text || "—";
};

const formatDefaultBalance = (value: number) =>
  value.toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const parseContactPersons = (
  party: LedgerPartyDetails,
): LedgerContactPerson[] => {
  if (Array.isArray(party.contactPersons) && party.contactPersons.length > 0) {
    return party.contactPersons.filter(
      (person) =>
        String(person?.name || "").trim() ||
        String(person?.designation || "").trim() ||
        String(person?.contactNumber || "").trim(),
    );
  }

  return String(party.contactPerson || "")
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [name, designation, contactNumber] = chunk
        .split("—")
        .map((part) => part.trim());
      return { name, designation, contactNumber };
    });
};

const Field = ({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Phone;
  label: string;
  children: ReactNode;
}) => (
  <div className="min-w-0">
    <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
      {children}
    </div>
  </div>
);

export const PartyLedgerHeader = ({
  party,
  balance,
  balanceLabel = "Balance",
  formatBalance = formatDefaultBalance,
  className,
}: {
  party: LedgerPartyDetails | null | undefined;
  balance?: number | null;
  balanceLabel?: string;
  formatBalance?: (value: number) => string;
  className?: string;
}) => {
  if (!party) return null;

  const partyLabel = party.type === "supplier" ? "Supplier" : "Customer";
  const contacts = parseContactPersons(party);
  const amount = Number(balance);
  const hasBalance = balance != null && Number.isFinite(amount);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950",
        className,
      )}
    >
      <div className="grid grid-cols-1 md:grid-cols-[1fr_220px]">
        <div className="space-y-4 p-4 md:p-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {partyLabel}
            </p>
            <h3 className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              {dash(party.name)}
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field icon={Phone} label="Phone / Mobile">
              {dash(party.phone)}
            </Field>
            <Field icon={MapPin} label="Address">
              <span className="leading-5">{dash(party.address)}</span>
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <UserRound className="h-3.5 w-3.5" />
              Contact persons
            </div>
            {contacts.length === 0 ? (
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                —
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {contacts.map((person, index) => (
                  <div
                    key={`${person.name || "contact"}-${index}`}
                    className="min-w-[180px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                      {dash(person.name)}
                    </p>
                    {person.designation ? (
                      <p className="text-xs text-slate-500">
                        {person.designation}
                      </p>
                    ) : null}
                    {person.contactNumber ? (
                      <p className="mt-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                        {person.contactNumber}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {hasBalance ? (
          <div className="flex flex-col justify-center border-t border-slate-200 bg-slate-50 px-5 py-4 md:border-l md:border-t-0 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {balanceLabel}
            </p>
            <p
              className={cn(
                "mt-1 text-3xl font-semibold tabular-nums leading-none",
                amount === 0
                  ? "text-slate-700 dark:text-slate-200"
                  : balanceValueClass(amount),
              )}
            >
              {formatBalance(amount)}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
};
