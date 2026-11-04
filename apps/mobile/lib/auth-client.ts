import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import { getApiUrl } from "./config";
import { getToken, setToken } from "./storage";

const baseURL = getApiUrl() ?? "http://localhost:3000";

export const authClient = createAuthClient({
  baseURL,
  plugins: [expoClient({ scheme: "juniper", storagePrefix: "juniper", storage: SecureStore })],
  // Better Auth's bearer plugin answers with the signed session token in `set-auth-token`; calls send it back.
  fetchOptions: { auth: { type: "Bearer", token: async () => (await getToken()) ?? undefined } },
});

/** Email and password sign in. Saves the set-auth-token value in SecureStore. Returns an error message to show, or null. */
export async function signInWithEmail(email: string, password: string): Promise<string | null> {
  let token: string | null = null;
  const { error } = await authClient.signIn.email({
    email: email.trim(),
    password,
    fetchOptions: {
      onSuccess: (ctx) => {
        token = ctx.response.headers.get("set-auth-token");
      },
    },
  });
  if (error) return error.message || "Those details did not work. Check your email and password.";
  if (!token) return "Signed in, but no session came back. Try again.";
  await setToken(token);
  return null;
}
