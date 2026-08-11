import React, { useState } from "react";
import { supabase } from "./lib/supabase";

const T = {
  paper: "#EFECDF", surface: "#FAF8F0", ink: "#1E2A22", inkSoft: "#5B6459",
  brass: "#A9824C", negative: "#A64B3A", line: "#DAD5C3",
};

export default function Auth() {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setNotice(""); setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setNotice("Account created. Check your email to confirm, then sign in.");
        setMode("signin");
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      fontFamily: "'IBM Plex Sans', sans-serif", background: T.paper, color: T.ink,
      minHeight: "100vh", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
        .authfield { border:1px solid ${T.line}; border-radius:8px; padding:10px 12px; font-size:16px; background:${T.surface}; color:${T.ink}; width:100%; }
        .authfield:focus { outline:2px solid ${T.brass}; outline-offset:1px; }
        .authbtn { border:1px solid ${T.ink}; background:${T.ink}; color:${T.paper}; border-radius:8px; padding:10px 14px; font-size:14px; font-weight:500; width:100%; cursor:pointer; }
        .authbtn:disabled { opacity: 0.6; cursor: default; }
        .authlink { background:none; border:none; color:${T.brass}; font-size:13px; cursor:pointer; text-decoration: underline; padding: 0; }
      `}</style>
      <div style={{ width: "100%", maxWidth: 340 }}>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: 26, marginBottom: 4, textAlign: "center" }}>Passbook</div>
        <div style={{ color: T.inkSoft, fontSize: 13, textAlign: "center", marginBottom: 24 }}>
          {mode === "signin" ? "Sign in to see your ledger." : "Create an account to sync across your devices."}
        </div>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            className="authfield" type="email" placeholder="Email" value={email} autoComplete="email"
            onChange={(e) => setEmail(e.target.value)} required
          />
          <input
            className="authfield" type="password" placeholder="Password" value={password}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            onChange={(e) => setPassword(e.target.value)} required minLength={6}
          />
          {error && <div style={{ color: T.negative, fontSize: 12.5 }}>{error}</div>}
          {notice && <div style={{ color: T.brass, fontSize: 12.5 }}>{notice}</div>}
          <button className="authbtn" type="submit" disabled={loading}>
            {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        <div style={{ textAlign: "center", marginTop: 16 }}>
          {mode === "signin" ? (
            <button className="authlink" onClick={() => { setMode("signup"); setError(""); setNotice(""); }}>
              Don't have an account? Sign up
            </button>
          ) : (
            <button className="authlink" onClick={() => { setMode("signin"); setError(""); setNotice(""); }}>
              Already have an account? Sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
