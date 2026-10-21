const faqs = [
  {
    q: 'When will my order arrive?',
    a: 'Orders placed before 8 pm are delivered the next morning. Orders after 8 pm go out the following day.',
  },
  {
    q: 'Do you deliver to my area?',
    a: 'We deliver within 15 km of the bakery. Enter your address at checkout to confirm.',
  },
  {
    q: 'Do you offer gluten-free or vegan options?',
    a: 'Yes — look for the gluten-free and vegan notes in each product description. Our kitchen handles wheat, nuts and dairy, so we cannot guarantee zero cross-contact.',
  },
  {
    q: 'Can I place a custom or bulk order?',
    a: 'Absolutely. For celebration cakes or orders of 24+ items, email us at least 48 hours ahead.',
  },
  {
    q: 'Can I cancel or change an order?',
    a: 'You can request changes until 9 pm the day before delivery by contacting us with your order number.',
  },
];

export default function Faq() {
  return (
    <div className="container page narrow" data-testid="faq-page">
      <h1>FAQs</h1>
      <div className="faq-list">
        {faqs.map((f) => (
          <details key={f.q} className="faq-item">
            <summary>{f.q}</summary>
            <p className="muted">{f.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
