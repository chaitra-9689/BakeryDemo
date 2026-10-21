import { Link } from 'react-router';

export default function About() {
  return (
    <div className="container page narrow" data-testid="about-page">
      <h1>About us</h1>
      <p>
        Crumb &amp; Co. started in 2014 as a two-oven corner bakery. We still bake everything from scratch each
        morning — slow-fermented breads, laminated pastries and seasonal cakes made with local flour, butter and fruit.
      </p>
      <p className="muted">
        Every order is baked the day it goes out, so what reaches your table is as fresh as what's on our counter.
      </p>
      <Link to="/shop" className="btn">Browse the shop</Link>
    </div>
  );
}
