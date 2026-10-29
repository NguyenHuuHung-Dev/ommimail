import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthSession } from "./AuthSession";
import "./public-home.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <AuthSession>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthSession>
    </QueryClientProvider>
  </React.StrictMode>,
);
