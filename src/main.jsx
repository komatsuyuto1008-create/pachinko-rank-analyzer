import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// localStorage polyfill for window.storage used in App
if (!window.storage) {
  window.storage = {
    get: (key) => Promise.resolve({ value: localStorage.getItem(key) }),
    set: (key, value) => Promise.resolve(localStorage.setItem(key, value)),
  };
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
