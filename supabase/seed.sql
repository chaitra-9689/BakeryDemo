-- Starter catalog for the bakery storefront.
insert into public.categories (name, slug, sort_order) values
  ('Breads', 'breads', 1),
  ('Cakes', 'cakes', 2),
  ('Pastries', 'pastries', 3),
  ('Cupcakes & Muffins', 'cupcakes-muffins', 4),
  ('Cookies & Brownies', 'cookies-brownies', 5);

insert into public.products (category_id, name, slug, description, price, image_url, is_featured)
select c.id, p.name, p.slug, p.description, p.price,
       'https://images.unsplash.com/photo-' || p.photo || '?w=800&h=600&fit=crop&q=75',
       p.featured
from (values
  ('breads', 'Country Sourdough', 'country-sourdough', 'Naturally leavened over 36 hours, with a blistered crust and an open, tangy crumb.', 280, '1586444248902-2f64eddc13df', true),
  ('breads', 'Dark Rye Loaf', 'dark-rye-loaf', 'Dense, earthy rye with caraway. Lovely with butter and smoked salmon.', 240, '1509440159596-0249088772ff', false),
  ('breads', 'Whole Wheat Sandwich Loaf', 'whole-wheat-loaf', 'Soft, pre-sliced whole wheat bread for everyday sandwiches and toast.', 160, '1549931319-a545dcf3bc73', false),
  ('breads', 'Baker''s Basket', 'bakers-basket', 'A morning assortment of baguettes, rolls and seeded buns. Serves four.', 450, '1608198093002-ad4e005484ec', false),
  ('cakes', 'Chocolate Truffle Cake', 'chocolate-truffle-cake', 'Layers of dark chocolate sponge and ganache, finished with chocolate curls. 1 kg.', 1250, '1578985545062-69928b1d9587', true),
  ('cakes', 'Raspberry Cream Cake', 'raspberry-cream-cake', 'Vanilla chiffon with fresh raspberries and whipped mascarpone cream. 1 kg.', 1150, '1565958011703-44f9829ba187', true),
  ('cakes', 'Mocha Layer Slice', 'mocha-layer-slice', 'Coffee-soaked sponge and chocolate cream in a generous single slice.', 220, '1571115177098-24ec42ed204d', false),
  ('cakes', 'Lemon Meringue Pie', 'lemon-meringue-pie', 'Bright lemon curd in a buttery shell under a cloud of toasted meringue. 8 inch.', 780, '1519915028121-7d3463d20b13', false),
  ('pastries', 'Butter Croissant', 'butter-croissant', 'Flaky, golden and laminated with French butter. Baked fresh every morning.', 120, '1530610476181-d83430b64dcd', true),
  ('pastries', 'Almond Croissant', 'almond-croissant', 'Twice-baked croissant filled with almond frangipane and dusted with sugar.', 160, '1555507036-ab1f4038808a', false),
  ('pastries', 'Mixed Berry Tart', 'mixed-berry-tart', 'Crisp pastry, vanilla custard and a lattice of seasonal berries.', 340, '1464305795204-6f5bbfc7fb81', false),
  ('pastries', 'Sprinkle Doughnuts (3)', 'sprinkle-doughnuts', 'Three yeast-raised doughnuts glazed with chocolate and rainbow sprinkles.', 210, '1551024601-bec78aea704b', false),
  ('cupcakes-muffins', 'Chocolate Fudge Cupcake', 'chocolate-fudge-cupcake', 'Moist chocolate cupcake topped with a swirl of fudge frosting.', 110, '1550617931-e17a7b70dce2', true),
  ('cupcakes-muffins', 'Strawberry Cupcake', 'strawberry-cupcake', 'Vanilla sponge with strawberry buttercream and a fresh berry on top.', 110, '1563729784474-d77dbb933a9e', false),
  ('cupcakes-muffins', 'Mint Chocolate Cupcake', 'mint-chocolate-cupcake', 'Dark chocolate cupcake with cool peppermint frosting.', 120, '1587668178277-295251f900ce', false),
  ('cupcakes-muffins', 'Cookies & Cream Cupcake', 'cookies-cream-cupcake', 'Chocolate base, cookies and cream frosting and a crushed cookie crumble.', 120, '1612203985729-70726954388c', false),
  ('cupcakes-muffins', 'Blueberry Muffin', 'blueberry-muffin', 'Bursting with blueberries under a crunchy cinnamon streusel.', 95, '1607958996333-41aef7caefaa', false),
  ('cookies-brownies', 'Chocolate Chip Cookies (6)', 'chocolate-chip-cookies', 'Six chewy cookies loaded with dark and milk chocolate chunks.', 240, '1558961363-fa8fdf82db35', true),
  ('cookies-brownies', 'Double Chocolate Cookies (6)', 'double-chocolate-cookies', 'Cocoa dough, molten chocolate pools and a pinch of sea salt.', 260, '1499636136210-6f4ee915583e', false),
  ('cookies-brownies', 'Fudge Brownies (4)', 'fudge-brownies', 'Rich, crackly-topped brownies made with Belgian dark chocolate.', 300, '1606313564200-e75d5e30476c', false)
) as p(category_slug, name, slug, description, price, photo, featured)
join public.categories c on c.slug = p.category_slug;
