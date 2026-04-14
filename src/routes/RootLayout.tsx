import { Outlet } from 'react-router-dom';
import NavBar from '../components/NavBar';
import '../styles/app.css';

export default function RootLayout() {
  return (
    <>
      <NavBar />
      <main className="main-content">
        <Outlet />
      </main>
    </>
  );
}
