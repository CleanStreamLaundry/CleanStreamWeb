import {useEffect, useState} from "react";
import '../styles/Login.css'
import { useAuth } from "../di/container";
import { AuthenticationResponse} from "../supabase/enum/authentication_responses";
import { useNavigate } from "react-router-dom";
import logo from "../assets/Logo-web.png";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [obscure, setObscure] = useState(true);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();
  const { login, restoreSession } = useAuth();

  useEffect(() => {
    let active = true;
    const tryAutoLogin = async () => {
      try {
        const response = await restoreSession();
        if (active && response === AuthenticationResponse.success) {
          navigate("/home");
        }
      } catch (e) {
        console.error("restoreSession failed:", e);
      } finally {
        if (active) setChecking(false);
      }
    };
    tryAutoLogin();
    return () => { active = false; };
  }, [navigate, restoreSession]);

  if (checking) return null;

  const handleLogin = async () => {
    setError("");

    if (email === "" || password === "") {
      setError("Please fill in both fields");
      return;
    }

    const loginResponse: AuthenticationResponse = await login(email, password);
    if (loginResponse === AuthenticationResponse.failure) {
      setError("Email or Password is incorrect");
    } else if (loginResponse === AuthenticationResponse.invalidPermissions) {
      setError("Invalid Permissions. Must be an Owner or Admin!");
    } else {
      navigate("/home");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    if (error) setError("");
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    if (error) setError("");
  };

  return (
      <div className="login-container" onKeyDown={handleKeyPress}>
        <img src={logo} className="logo" alt="Clean Stream Laundry Solutions" />

        {error && <div className="error-message">{error}</div>}

        <input
            className={`input ${error ? "error" : ""}`}
            placeholder="Email"
            value={email}
            onChange={handleEmailChange}
        />

        <div className="password-container">
          <input
              className={`input password-input ${error ? "error" : ""}`}
              type={obscure ? "password" : "text"}
              placeholder="Password"
              value={password}
              onChange={handlePasswordChange}
          />
          <button
              type="button"
              className="show-button"
              onClick={() => setObscure(!obscure)}
          >
            {obscure ? "Show" : "Hide"}
          </button>
        </div>

        <button className="login-button" onClick={handleLogin}>
          Log In
        </button>
      </div>
  );
}

export default Login;
