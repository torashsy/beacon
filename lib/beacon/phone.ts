export function normalizePhoneNumber(countryCode: string, nationalNumber: string): string {
  const country = countryCode.replace(/\D/g, "").slice(0, 4);
  let national = nationalNumber.replace(/\D/g, "");
  if (country === "81" && national.startsWith("0")) national = national.slice(1);
  const normalized = country && national ? `+${country}${national}` : "";
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : "";
}
