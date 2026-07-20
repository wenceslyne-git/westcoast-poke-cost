import { useState } from "react";
import { supabase, isOwner } from "./supabase.js";
import { WCP_LOGO } from "./data.jsx";

export default function Login({ T }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState("email"); // email → code
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const sendCode = async () => {
    setErr(null);
    const clean = email.toLowerCase().trim();
    if (!clean) return;
    if (!isOwner(clean)) {
      setErr("Access restricted. This app is for Westcoast Poké owners only.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: clean,
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setStage("code");
  };

  const verifyCode = async () => {
    setErr(null);
    if (!code.trim()) return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.toLowerCase().trim(),
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) { setErr("Invalid or expired code. Try again."); return; }
    // Session is set — App re-renders automatically via onAuthStateChange
  };

  const input = {
    width: "100%", background: T.bg, border: `1px solid ${T.border}`,
    borderRadius: 12, padding: "14px 16px", color: T.navy, fontSize: 16,
    fontFamily: "inherit", outline: "none", marginBottom: 12, textAlign: "center",
  };
  const btn = (disabled) => ({
    width: "100%", background: T.blue, color: "#fff", border: "none",
    borderRadius: 12, padding: "14px", fontSize: 16, fontWeight: 800,
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1,
  });

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 24, padding: "40px 32px", maxWidth: 400, width: "100%", textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.06)" }}>
        <div style={{ width: 88, height: 88, borderRadius: "50%", background: "#fff", border: `1px solid ${T.border}`, margin: "0 auto 20px", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <img src={WCP_LOGO} alt="Westcoast Poké" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: T.blue, letterSpacing: "-0.5px", marginBottom: 2 }}>Westcoast Poké</div>
        <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "2px", fontWeight: 700, marginBottom: 28 }}>Cost Intelligence</div>

        {stage === "email" && (
          <>
            <div style={{ fontSize: 15, color: T.slate, marginBottom: 20, lineHeight: 1.6 }}>Owner access only.<br />Enter your email to receive a sign-in link.</div>
            <input style={input} type="email" placeholder="you@westcoastpoke.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && !busy && sendCode()} autoFocus />
            <button style={btn(busy || !email.trim())} disabled={busy || !email.trim()} onClick={sendCode}>{busy ? "Sending link..." : "Send sign-in link"}</button>
          </>
        )}

        {stage === "code" && (
          <>
            <div style={{ fontSize: 15, color: T.slate, marginBottom: 20, lineHeight: 1.6 }}>We emailed a sign-in link to<br /><strong>{email}</strong><br /><span style={{ fontSize: 12, color: T.muted }}>Click the link in the email — it brings you straight back here, signed in. (If your email shows a 6-digit code instead, enter it below.)</span></div>
            <input style={{ ...input, letterSpacing: "8px", fontSize: 22, fontWeight: 700 }} inputMode="numeric" maxLength={6} placeholder="······" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} onKeyDown={e => e.key === "Enter" && !busy && verifyCode()} autoFocus />
            <button style={btn(busy || code.length < 6)} disabled={busy || code.length < 6} onClick={verifyCode}>{busy ? "Verifying..." : "Verify & sign in"}</button>
            <button style={{ background: "none", border: "none", color: T.muted, fontSize: 13, cursor: "pointer", marginTop: 14 }} onClick={() => { setStage("email"); setCode(""); setErr(null); }}>← Use a different email</button>
          </>
        )}

        {err && <div style={{ marginTop: 16, background: T.coralL, color: T.coral, borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600 }}>{err}</div>}

        <div style={{ marginTop: 28, fontSize: 11, color: T.muted, lineHeight: 1.6 }}>Codes expire after a few minutes.<br />Access is restricted to approved owner accounts.</div>
      </div>
    </div>
  );
}
