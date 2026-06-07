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

  return (
    <section className="login-screen">
      <img className="login-watermark" src="/assets/vizex-logo-transparent.png" alt="" />
      <div className="login-content">
        <div className="login-copy" aria-label="VIZEX">
          <div className="brand-lockup">
            <img className="login-logo" src="/assets/vizex-logo-transparent.png" alt="VIZEX logo" />
            <p className="login-tagline">Tiešsaistes videonovērošanas sistēmu platforma</p>
          </div>
        </div>

        <div className="auth-card">
          <div className="auth-tabs" aria-label="Autentifikācijas sadaļas">
            {[
              ["login", "Pieslēgties"],
              ["register", "Reģistrēties"]
            ].map(([panel, label]) => (
              <button
                className={`auth-tab ${activePanel === panel || (activePanel === "recover" && panel === "login") ? "active" : ""}`}
                key={panel}
                onClick={() => onPanelChange(panel as AuthPanel)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          <section className={`auth-panel ${activePanel === "login" ? "active" : ""}`}>
            <form className="login-form" onSubmit={submitLogin}>
              <label>
                E-pasts
                <input value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} type="email" autoComplete="email" required />
              </label>
              <label>
                Parole
                <input value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} type="password" autoComplete="current-password" required minLength={6} />
              </label>
              <button className="forgot-password-link" onClick={() => onPanelChange("recover")} type="button">
                Aizmirsi paroli?
              </button>
              <button className="primary-button login-submit" type="submit">Pieslēgties</button>
            </form>
          </section>

          <section className={`auth-panel ${activePanel === "register" ? "active" : ""}`}>
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
              <button className="primary-button login-submit" type="submit">Izveidot kontu</button>
            </form>
          </section>

          <section className={`auth-panel ${activePanel === "recover" ? "active" : ""}`}>
            <div className="login-card-head recovery-head">
              <h2>Aizmirsi paroli?</h2>
            </div>
            <form className="login-form" onSubmit={submitRecover}>
              <label>
                E-pasts
                <input value={recoverEmail} onChange={(event) => setRecoverEmail(event.target.value)} type="email" autoComplete="email" required />
              </label>
              <button className="primary-button login-submit" type="submit">Nosūtīt saiti</button>
            </form>
            <button className="forgot-password-link back-to-login" onClick={() => onPanelChange("login")} type="button">
              Atpakaļ uz pieslēgšanos
            </button>
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
