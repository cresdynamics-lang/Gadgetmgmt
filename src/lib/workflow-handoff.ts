const SALE_CUSTOMER = "gadgethub.saleCustomer";
const LIPA_ACCOUNT = "gadgethub.lipaAccount";
const ID_PATTERN = /^[a-z0-9]{8,40}$/i;

function remember(key: string, id: string) {
  if (typeof sessionStorage === "undefined" || !ID_PATTERN.test(id)) return;
  sessionStorage.setItem(key, id);
}

function take(key: string) {
  if (typeof sessionStorage === "undefined") return null;
  const value = sessionStorage.getItem(key);
  sessionStorage.removeItem(key);
  return value && ID_PATTERN.test(value) ? value : null;
}

export function rememberSaleCustomer(customerId: string) {
  remember(SALE_CUSTOMER, customerId);
}

export function takeSaleCustomer() {
  return take(SALE_CUSTOMER);
}

export function rememberLipaAccount(accountId: string) {
  remember(LIPA_ACCOUNT, accountId);
}

export function takeLipaAccount() {
  return take(LIPA_ACCOUNT);
}
