import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import LocaleManager from "./pages/LocaleManager";
import Login from "./pages/Login";
import TranslationEditorOptimized from "./pages/TranslationEditorOptimized";
import HistoryPage from "./pages/HistoryPage";
import UserManager from "./pages/UserManager";
import Home from "./pages/Home";
import SharedKeysManager from "./pages/TemplateManager";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/locales" component={LocaleManager} />
      <Route path="/editor" component={TranslationEditorOptimized} />
      <Route path="/shared-keys" component={SharedKeysManager} />
      {/* legacy alias — keep old bookmarks working */}
      <Route path="/templates" component={SharedKeysManager} />
      <Route path="/history" component={HistoryPage} />
      <Route path="/users" component={UserManager} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
