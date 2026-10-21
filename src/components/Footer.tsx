const socials = [
  {
    name: 'Instagram',
    handle: '@crumbandco',
    href: 'https://instagram.com/crumbandco',
    icon: (
      <path d="M12 2.2c3.2 0 3.6 0 4.8.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-3.3-.1-4.8-1.7-4.9-4.9C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8C2.4 3.9 3.9 2.4 7.2 2.3 8.4 2.2 8.8 2.2 12 2.2zm0 4.9a4.9 4.9 0 1 0 0 9.8 4.9 4.9 0 0 0 0-9.8zm0 8.1a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4zm5.1-9.4a1.1 1.1 0 1 0 0 2.3 1.1 1.1 0 0 0 0-2.3z" />
    ),
  },
  {
    name: 'Facebook',
    handle: 'Crumb & Co. Bakery',
    href: 'https://facebook.com/crumbandco',
    icon: (
      <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z" />
    ),
  },
  {
    name: 'X',
    handle: '@crumbandco',
    href: 'https://x.com/crumbandco',
    icon: (
      <path d="M17.8 3h3.1l-6.8 7.7 8 10.3h-6.2l-4.9-6.3L5.4 21H2.3l7.2-8.3L1.8 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z" />
    ),
  },
  {
    name: 'TikTok',
    handle: '@crumbandco',
    href: 'https://tiktok.com/@crumbandco',
    icon: (
      <path d="M16.6 2h-3.3v13.4a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .8.1V9.2a6.2 6.2 0 1 0 5.4 6.2V8.6a7.6 7.6 0 0 0 4.4 1.4V6.7a4.4 4.4 0 0 1-4.4-4.7z" />
    ),
  },
];

export default function Footer() {
  return (
    <footer className="footer" data-testid="footer">
      <div className="container footer-grid">
        <section className="footer-col" aria-labelledby="footer-contact" data-testid="footer-contact">
          <h3 id="footer-contact">Contact</h3>
          <address className="footer-contact">
            <span>12 Baker Street, Springfield</span>
            <a href="tel:+15550123456">+1 (555) 012-3456</a>
            <a href="mailto:hello@crumbandco.example">hello@crumbandco.example</a>
          </address>
          <p className="muted small">
            Open Mon–Sat 7 am – 7 pm
            <br />
            Sun 8 am – 2 pm
          </p>
        </section>

        <section className="footer-col" aria-labelledby="footer-social" data-testid="footer-social">
          <h3 id="footer-social">Follow us</h3>
          <ul className="social-list">
            {socials.map((s) => (
              <li key={s.name}>
                <a href={s.href} target="_blank" rel="noopener noreferrer" aria-label={`${s.name}: ${s.handle}`}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
                    {s.icon}
                  </svg>
                  <span>{s.handle}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="container footer-bottom">
        <p className="muted small">© {new Date().getFullYear()} Crumb &amp; Co. Bakery · Baked fresh every morning</p>
      </div>
    </footer>
  );
}
