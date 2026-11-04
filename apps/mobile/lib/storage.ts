import * as SecureStore from "expo-secure-store";

// SecureStore keys may only use letters, numbers, ".", "-" and "_". Same "juniper" prefix as the auth client.
const TOKEN_KEY = "juniper_bearer_token";
const WORKSPACE_KEY = "juniper_workspace_id";

let tokenCache: string | null | undefined;
let workspaceCache: string | null | undefined;

async function read(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function getToken(): Promise<string | null> {
  if (tokenCache === undefined) tokenCache = await read(TOKEN_KEY);
  return tokenCache;
}

export async function setToken(token: string): Promise<void> {
  tokenCache = token;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getWorkspaceId(): Promise<string | null> {
  if (workspaceCache === undefined) workspaceCache = await read(WORKSPACE_KEY);
  return workspaceCache;
}

export async function setWorkspaceId(id: string | null): Promise<void> {
  workspaceCache = id;
  if (id) await SecureStore.setItemAsync(WORKSPACE_KEY, id);
  else await SecureStore.deleteItemAsync(WORKSPACE_KEY).catch(() => {});
}

/** Sign out: forget the token and the chosen business, so the next person starts clean. */
export async function clearSession(): Promise<void> {
  tokenCache = null;
  workspaceCache = null;
  await Promise.all([SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {}), SecureStore.deleteItemAsync(WORKSPACE_KEY).catch(() => {})]);
}
