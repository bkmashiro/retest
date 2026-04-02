import { login } from "./auth.js";

export function callApi(): string {
  return login();
}
