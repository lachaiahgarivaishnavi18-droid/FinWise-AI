const API = import.meta.env.VITE_API_URL || "";
let accessToken = sessionStorage.getItem("finwise_token");
async function api(path, method = "GET", body) {
  const res = await fetch(API + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      sessionStorage.removeItem("finwise_token");
      window.dispatchEvent(new Event("unauthorized"));
    }
    throw new Error(payload.error || payload.msg || "Request failed.");
  }
  return payload;
}

export { api };
export const getAccessToken = () => accessToken;
export function setAccessToken(token) {
  accessToken = token;
  if (token) sessionStorage.setItem("finwise_token", token);
  else sessionStorage.removeItem("finwise_token");
}
