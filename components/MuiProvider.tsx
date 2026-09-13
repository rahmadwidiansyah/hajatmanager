"use client";

import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { muiTheme } from "@/app/mui-theme";

export function MuiProvider({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterCacheProvider>
      {/* Tanpa defaultMode = ikut OS (system) di kunjungan pertama.
          Pilihan manual tersimpan di localStorage "mui-mode" dan menang setelahnya. */}
      <ThemeProvider theme={muiTheme}>
        <CssBaseline enableColorScheme />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
