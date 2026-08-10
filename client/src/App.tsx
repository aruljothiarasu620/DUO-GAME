// client/src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import CreateRoom from './pages/CreateRoom';
import JoinRoom from './pages/JoinRoom';
import GameScreen from './pages/GameScreen';
import './styles/index.css';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"       element={<Landing />} />
        <Route path="/create" element={<CreateRoom />} />
        <Route path="/join"   element={<JoinRoom />} />
        <Route path="/game"   element={<GameScreen />} />
      </Routes>
    </BrowserRouter>
  );
}
