import { FormEvent, useState } from "react";
import type { AuthPanel } from "../types";

type AuthScreenProps = {
  activePanel: AuthPanel;
  resetVisible: boolean;
  onPanelChange: (panel: AuthPanel) => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string) => Promise<void>;
  onRecover: (email: string) => Promise<void>;
  onUpdatePassword: (password: string) => Promise<void>;
  onResendConfirmation: (email: string) => Promise<void>;
  onToast: (message: string) => void;
};

export function AuthScreen({
  activePanel,
  resetVisible,
  onPanelChange,
  onLogin,
  onRegister,
  onRecover,
  onUpdatePassword,
  onResendConfirmation,
  onToast
}: AuthScreenProps) {
  const [loginEmail, setLoginEmail] = useState("client@vizex.app");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState("");
  const [recoverEmail, setRecoverEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    await onLogin(loginEmail, loginPassword);
  }

  async function submitRegister(event: FormEvent) {
    event.preventDefault();
    if (registerPassword !== registerPasswordConfirm) {
      onToast("Paroles nesakrīt.");
      return;
    }
    await onRegister(registerEmail, registerPassword);
    setLoginEmail(registerEmail);
    setLoginPassword("");
    onPanelChange("login");
  }

  async function submitRecover(event: FormEvent) {
    event.preventDefault();
    await onRecover(recoverEmail);
  }

  async function submitReset(event: FormEvent) {
    event.preventDefault();
    await onUpdatePassword(newPassword);
    setNewPassword("");
  }

  function fillDemo() {
    setLoginEmail("client@vizex.app");
    setLoginPassword("");
    onToast("Ievadiet savu Supabase konta paroli");
  }

  return (
    <section className="login-screen">
      <img className="login-watermark" src="/assets/vizex-logo-transparent.png" alt="" />
      <div className="login-content">
        <div className="login-copy">
          <img className="login-logo" src="/assets/vizex-logo-transparent.png" alt="VIZEX logo" />
          <span className="eyebrow">VIZEXAPP klientu platforma</span>
          <h1>Droša piekļuve jūsu video sistēmai.</h1>
          <p>Tiešraides, ieraksti, kameru pārskats un klienta profils vienā tīrā darba vidē.</p>
          <div className="login-meta" aria-label="Platformas statuss">
            <span>Supabase Auth</span>
            <span>Klienta profils</span>
            <span>Vercel preview</span>
          </div>
        </div>

        <div className="auth-card">
          <div className="auth-tabs" aria-label="Autentifikācijas sadaļas">
            {[
              ["login", "Pieslēgties"],
              ["register", "Reģistrēties"],
              ["recover", "Aizmirsi paroli?"]
            ].map(([panel, label]) => (
              <button
                className={`auth-tab ${activePanel === panel ? "active" : ""}`}
                key={panel}
                onClick={() => onPanelChange(panel as AuthPanel)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          <section className={`auth-panel ${activePanel === "login" ? "active" : ""}`}>
            <div className="login-card-head">
              <span className="eyebrow">Klienta pieslēgšanās</span>
              <h2>Ienākt savā profilā</h2>
              <p>Izmantojiet reģistrētu e-pastu un paroli. Konti tiek sinhronizēti Supabase mākonī.</p>
            </div>
            <form className="login-form" onSubmit={submitLogin}>
              <label>
                E-pasts
                <input value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} type="email" autoComplete="email" required />
              </label>
              <label>
                Parole
                <input value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} type="password" autoComplete="current-password" required minLength={6} />
              </label>
              <button className="primary-button login-submit" type="submit">Pieslēgties</button>
            </form>
            <div className="auth-actions">
              <button className="ghost-button fill-demo" onClick={fillDemo} type="button">Aizpildīt demo datus</button>
              <button className="ghost-button fill-demo" onClick={() => onResendConfirmation(loginEmail || registerEmail)} type="button">
                Nosūtīt apstiprinājuma e-pastu vēlreiz
              </button>
            </div>
          </section>

          <section className={`auth-panel ${activePanel === "register" ? "active" : ""}`}>
            <div className="login-card-head">
              <span className="eyebrow">Jauns klienta konts</span>
              <h2>Izveidot profilu</h2>
              <p>Datubāzē tiek reģistrēts tikai klienta e-pasts un konta statuss. Personas kodus un liekus datus neprasām.</p>
            </div>
            <form className="login-form" onSubmit={submitRegister}>
              <label>
                E-pasts
                <input value={registerEmail} onChange={(event) => setRegisterEmail(event.target.value)} type="email" autoComplete="email" required />
              </label>
              <label>
                Parole
                <input value={registerPassword} onChange={(event) => setRegisterPassword(event.target.value)} type="password" autoComplete="new-password" required minLength={8} />
              </label>
              <label>
                Atkārtot paroli
                <input value={registerPasswordConfirm} onChange={(event) => setRegisterPasswordConfirm(event.target.value)} type="password" autoComplete="new-password" required minLength={8} />
              </label>
              <button className="primary-button login-submit" type="submit">Reģistrēt klientu</button>
            </form>
          </section>

          <section className={`auth-panel ${activePanel === "recover" ? "active" : ""}`}>
            <div className="login-card-head">
              <span className="eyebrow">Piekļuves atkopšana</span>
              <h2>Atjaunot paroli</h2>
              <p>Ievadiet reģistrēto e-pastu, un Supabase nosūtīs paroles atjaunošanas saiti.</p>
            </div>
            <form className="login-form" onSubmit={submitRecover}>
              <label>
                Reģistrētais e-pasts
                <input value={recoverEmail} onChange={(event) => setRecoverEmail(event.target.value)} type="email" autoComplete="email" required />
              </label>
              <button className="primary-button login-submit" type="submit">Nosūtīt atjaunošanas saiti</button>
            </form>
            {resetVisible && (
              <form className="login-form recovery-reset" onSubmit={submitReset}>
                <label>
                  Jaunā parole
                  <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" autoComplete="new-password" required minLength={8} />
                </label>
                <button className="ghost-button" type="submit">Nomainīt paroli</button>
              </form>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
