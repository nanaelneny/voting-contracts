// How this installation is set up for its institution: its name, what members' IDs are
// called, and which email addresses can sign up. Set in voting-backend/.env.
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

const DEFAULTS = { organisationName: "", memberIdLabel: "Member ID", allowedEmailDomains: [] };
const SettingsContext = createContext(DEFAULTS);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);
  useEffect(() => {
    api.settings().then((s) => setSettings({ ...DEFAULTS, ...s })).catch(() => {});
  }, []);
  return <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
