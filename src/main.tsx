import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initAutoCapsLock } from "./utils/autoCaps";

// initAutoCapsLock();

createRoot(document.getElementById("root")!).render(<App />);
