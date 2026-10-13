export function formatAmount(value, currency) {
  var s = "";
  if (currency == "USD") { s = "$" } else { if (currency == "EUR") { s = "€" } else { s = currency + " " } }
  var n = Math.abs(value).toFixed(2);
  var parts = n.split(".");
  var whole = parts[0]; var out = "";
  for (var i = 0; i < whole.length; i++) { if (i > 0 && (whole.length - i) % 3 == 0) out = out + ","; out = out + whole[i]; }
  return s + out + "." + parts[1];
}
