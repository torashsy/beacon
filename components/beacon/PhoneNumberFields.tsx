type Props = {
  idPrefix: string;
  countryCode: string;
  nationalNumber: string;
  onCountryCodeChange: (value: string) => void;
  onNationalNumberChange: (value: string) => void;
};

export function PhoneNumberFields({
  idPrefix,
  countryCode,
  nationalNumber,
  onCountryCodeChange,
  onNationalNumberChange,
}: Props) {
  return (
    <div className="phoneFields">
      <div>
        <label className="f" htmlFor={`${idPrefix}-country`}>国番号</label>
        <div className="countryCodeField">
          <span aria-hidden="true">+</span>
          <input
            id={`${idPrefix}-country`}
            inputMode="numeric"
            autoComplete="tel-country-code"
            value={countryCode.replace(/\D/g, "")}
            onChange={(event) => onCountryCodeChange(event.target.value.replace(/\D/g, "").slice(0, 4))}
            maxLength={4}
            aria-label="国番号"
          />
        </div>
      </div>
      <div>
        <label className="f" htmlFor={`${idPrefix}-national`}>電話番号</label>
        <input
          id={`${idPrefix}-national`}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={nationalNumber}
          onChange={(event) => onNationalNumberChange(event.target.value.replace(/[^\d\s-]/g, "").slice(0, 20))}
          placeholder="090 1234 5678"
        />
      </div>
    </div>
  );
}
