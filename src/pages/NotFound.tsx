import { Link } from 'react-router';

export default function NotFound() {
  return (
    <div className="container page empty-state">
      <h1>Page not found</h1>
      <p className="muted">This page seems to have crumbled.</p>
      <Link to="/" className="btn">Go home</Link>
    </div>
  );
}
