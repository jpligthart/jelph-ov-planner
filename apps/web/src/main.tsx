import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthGate } from "./Auth";
import "./styles.css";
import { applyTheme, loadTheme } from "./theme";

// Before the first render, so a chosen theme never flashes the other one.
applyTheme(loadTheme(), false);

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root not found");
}

createRoot(root).render(
  <StrictMode>
    <AuthGate />
  </StrictMode>,
);
