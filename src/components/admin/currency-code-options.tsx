const commonCurrencies = [
  ["USD", "US Dollar"],
  ["LBP", "Lebanese Pound"],
  ["EUR", "Euro"],
  ["GBP", "British Pound"],
  ["AED", "UAE Dirham"],
  ["SAR", "Saudi Riyal"],
] as const;

/** Suggestions only: the associated input remains editable for any valid code. */
export function CurrencyCodeOptions({ id }: { id: string }) {
  return (
    <datalist id={id}>
      {commonCurrencies.map(([code, name]) => (
        <option key={code} value={code}>{name}</option>
      ))}
    </datalist>
  );
}
