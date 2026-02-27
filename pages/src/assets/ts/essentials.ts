import 'bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.min.css';

document.addEventListener('DOMContentLoaded', () => {
  const setTheme = (theme: string) => {
    document.documentElement.setAttribute('data-bs-theme', theme);
  };
  const getPreferredTheme = (): 'light' | 'dark' => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };
  setTheme(getPreferredTheme());
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    setTheme(getPreferredTheme());
  });
});
