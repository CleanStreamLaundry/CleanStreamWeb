import "./cortinaReturn";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/_variables.css";
import App from "./App.js";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
