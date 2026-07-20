-- 1. Add the columns the app expects but the table is missing
alter table menu_items add column if not exists sizes jsonb;
alter table menu_items add column if not exists category text default 'classic';

-- 1b. Unique constraint on name so the app's Resync upsert (onConflict: name) works
create unique index if not exists menu_items_name_key on menu_items (name);

-- Adds any seed menu items missing from menu_items; never touches existing rows.

-- Run in Supabase SQL Editor.

insert into menu_items (name, price, sizes, ingredients, category)
select 'Aloha', 21.95, '{"small":19.95,"medium":21.95,"large":24.95}'::jsonb, '{"small":{"Sushi Rice":0.16,"Ahi Tuna":0.112,"House-made Shoyu":0.03,"Sesame Seeds":0.003,"Sweet Onion":0.02,"Scallion":0.01,"Jalapeno":0.01,"Cucumber":0.5,"Avocado":0.5,"Seaweed Salad":0.04},"medium":{"Sushi Rice":0.2,"Ahi Tuna":0.14,"House-made Shoyu":0.03,"Sesame Seeds":0.003,"Sweet Onion":0.02,"Scallion":0.01,"Jalapeno":0.01,"Cucumber":0.5,"Avocado":0.5,"Seaweed Salad":0.04},"large":{"Sushi Rice":0.25,"Ahi Tuna":0.175,"House-made Shoyu":0.03,"Sesame Seeds":0.003,"Sweet Onion":0.02,"Scallion":0.01,"Jalapeno":0.01,"Cucumber":0.5,"Avocado":0.5,"Seaweed Salad":0.04}}'::jsonb, 'classic'
where not exists (select 1 from menu_items where name = 'Aloha');

insert into menu_items (name, price, sizes, ingredients, category)
select 'Chief', 21.95, '{"small":19.95,"medium":21.95,"large":24.95}'::jsonb, '{"small":{"Sushi Rice":0.16,"Wild Sockeye Salmon":0.112,"Chili Oil":0.01,"Togarashi":0.003,"Avocado":0.5,"Shoyu":0.03,"Kimchi Cucumber":0.05,"Edamame":0.05,"Pineapple":0.25,"Wasabi Garlic":0.03,"Maple Soy":0.03},"medium":{"Sushi Rice":0.2,"Wild Sockeye Salmon":0.14,"Chili Oil":0.01,"Togarashi":0.003,"Avocado":0.5,"Shoyu":0.03,"Kimchi Cucumber":0.05,"Edamame":0.05,"Pineapple":0.25,"Wasabi Garlic":0.03,"Maple Soy":0.03},"large":{"Sushi Rice":0.25,"Wild Sockeye Salmon":0.175,"Chili Oil":0.01,"Togarashi":0.003,"Avocado":0.5,"Shoyu":0.03,"Kimchi Cucumber":0.05,"Edamame":0.05,"Pineapple":0.25,"Wasabi Garlic":0.03,"Maple Soy":0.03}}'::jsonb, 'classic'
where not exists (select 1 from menu_items where name = 'Chief');

insert into menu_items (name, price, sizes, ingredients, category)
select 'Cascade', 21.95, '{"small":19.95,"medium":21.95,"large":24.95}'::jsonb, '{"small":{"Sushi Rice":0.16,"Atlantic Salmon":0.112,"Shoyu":0.03,"Thai Chili":0.005,"Sweet Onion":0.02,"Kimchi Cucumber":0.05,"Jalapeno":0.01,"Crab Salad":0.05,"Spicy Seaweed Salad":0.04,"Yuzu Sriracha":0.03},"medium":{"Sushi Rice":0.2,"Atlantic Salmon":0.14,"Shoyu":0.03,"Thai Chili":0.005,"Sweet Onion":0.02,"Kimchi Cucumber":0.05,"Jalapeno":0.01,"Crab Salad":0.05,"Spicy Seaweed Salad":0.04,"Yuzu Sriracha":0.03},"large":{"Sushi Rice":0.25,"Atlantic Salmon":0.175,"Shoyu":0.03,"Thai Chili":0.005,"Sweet Onion":0.02,"Kimchi Cucumber":0.05,"Jalapeno":0.01,"Crab Salad":0.05,"Spicy Seaweed Salad":0.04,"Yuzu Sriracha":0.03}}'::jsonb, 'classic'
where not exists (select 1 from menu_items where name = 'Cascade');

insert into menu_items (name, price, sizes, ingredients, category)
select 'Coast', 21.95, '{"small":19.95,"medium":21.95,"large":24.95}'::jsonb, '{"small":{"Sushi Rice":0.16,"Atlantic Salmon":0.112,"Shoyu":0.03,"Burnt Miso Chili":0.02,"Kimchi Cucumber":0.05,"Mango":0.25,"Crab Salad":0.05,"Avocado":0.5,"Gochu Garlic":0.03,"Maple Soy":0.03},"medium":{"Sushi Rice":0.2,"Atlantic Salmon":0.14,"Shoyu":0.03,"Burnt Miso Chili":0.02,"Kimchi Cucumber":0.05,"Mango":0.25,"Crab Salad":0.05,"Avocado":0.5,"Gochu Garlic":0.03,"Maple Soy":0.03},"large":{"Sushi Rice":0.25,"Atlantic Salmon":0.175,"Shoyu":0.03,"Burnt Miso Chili":0.02,"Kimchi Cucumber":0.05,"Mango":0.25,"Crab Salad":0.05,"Avocado":0.5,"Gochu Garlic":0.03,"Maple Soy":0.03}}'::jsonb, 'classic'
where not exists (select 1 from menu_items where name = 'Coast');

insert into menu_items (name, price, sizes, ingredients, category)
select 'Smoke', 21.95, '{"small":19.95,"medium":21.95,"large":24.95}'::jsonb, '{"small":{"Sushi Rice":0.16,"Albacore Tuna":0.112,"Shoyu":0.03,"Thai Chili":0.005,"Burnt Miso Chili":0.02,"Scallion":0.01,"Cucumber":0.5,"Jalapeno":0.01,"Pickled Ginger":0.02,"Spicy Crab Salad":0.05,"Pineapple":0.25,"Yuzu Sriracha":0.03},"medium":{"Sushi Rice":0.2,"Albacore Tuna":0.14,"Shoyu":0.03,"Thai Chili":0.005,"Burnt Miso Chili":0.02,"Scallion":0.01,"Cucumber":0.5,"Jalapeno":0.01,"Pickled Ginger":0.02,"Spicy Crab Salad":0.05,"Pineapple":0.25,"Yuzu Sriracha":0.03},"large":{"Sushi Rice":0.25,"Albacore Tuna":0.175,"Shoyu":0.03,"Thai Chili":0.005,"Burnt Miso Chili":0.02,"Scallion":0.01,"Cucumber":0.5,"Jalapeno":0.01,"Pickled Ginger":0.02,"Spicy Crab Salad":0.05,"Pineapple":0.25,"Yuzu Sriracha":0.03}}'::jsonb, 'classic'
where not exists (select 1 from menu_items where name = 'Smoke');

insert into menu_items (name, price, sizes, ingredients, category)
select 'Pacific', 21.95, '{"small":19.95,"medium":21.95,"large":24.95}'::jsonb, '{"small":{"Sushi Rice":0.16,"Albacore Tuna":0.112,"Shoyu":0.03,"Pickled Red Onion":0.02,"Cilantro":0.005,"Cucumber":0.5,"Crab Salad":0.05,"Mango":0.25,"Pineapple":0.25,"Green Coco Curry":0.03},"medium":{"Sushi Rice":0.2,"Albacore Tuna":0.14,"Shoyu":0.03,"Pickled Red Onion":0.02,"Cilantro":0.005,"Cucumber":0.5,"Crab Salad":0.05,"Mango":0.25,"Pineapple":0.25,"Green Coco Curry":0.03},"large":{"Sushi Rice":0.25,"Albacore Tuna":0.175,"Shoyu":0.03,"Pickled Red Onion":0.02,"Cilantro":0.005,"Cucumber":0.5,"Crab Salad":0.05,"Mango":0.25,"Pineapple":0.25,"Green Coco Curry":0.03}}'::jsonb, 'classic'
where not exists (select 1 from menu_items where name = 'Pacific');

insert into menu_items (name, price, sizes, ingredients, category)
select 'Dynamite', 21.95, '{"small":19.95,"medium":21.95,"large":24.95}'::jsonb, '{"small":{"Sushi Rice":0.16,"Prawn":0.112,"Maple Soy":0.03,"Scallion":0.01,"Radish":0.02,"Tempura Crunch":0.015,"Cucumber":0.5,"Pickled Ginger":0.02,"Crab Salad":0.05,"Avocado":0.5,"Yuzu Sriracha":0.03},"medium":{"Sushi Rice":0.2,"Prawn":0.14,"Maple Soy":0.03,"Scallion":0.01,"Radish":0.02,"Tempura Crunch":0.015,"Cucumber":0.5,"Pickled Ginger":0.02,"Crab Salad":0.05,"Avocado":0.5,"Yuzu Sriracha":0.03},"large":{"Sushi Rice":0.25,"Prawn":0.175,"Maple Soy":0.03,"Scallion":0.01,"Radish":0.02,"Tempura Crunch":0.015,"Cucumber":0.5,"Pickled Ginger":0.02,"Crab Salad":0.05,"Avocado":0.5,"Yuzu Sriracha":0.03}}'::jsonb, 'classic'
where not exists (select 1 from menu_items where name = 'Dynamite');

insert into menu_items (name, price, sizes, ingredients, category)
select 'Teriyaki', 21.95, '{"small":19.95,"medium":21.95,"large":24.95}'::jsonb, '{"small":{"Sushi Rice":0.16,"Chicken":0.112,"Maple Soy":0.03,"Scallion":0.01,"Sweet Onion":0.02,"Cucumber":0.5,"Pickled Ginger":0.02,"Crab Salad":0.05,"Jalapeno":0.01,"Mango":0.25,"Miso Ginger Soy":0.03},"medium":{"Sushi Rice":0.2,"Chicken":0.14,"Maple Soy":0.03,"Scallion":0.01,"Sweet Onion":0.02,"Cucumber":0.5,"Pickled Ginger":0.02,"Crab Salad":0.05,"Jalapeno":0.01,"Mango":0.25,"Miso Ginger Soy":0.03},"large":{"Sushi Rice":0.25,"Chicken":0.175,"Maple Soy":0.03,"Scallion":0.01,"Sweet Onion":0.02,"Cucumber":0.5,"Pickled Ginger":0.02,"Crab Salad":0.05,"Jalapeno":0.01,"Mango":0.25,"Miso Ginger Soy":0.03}}'::jsonb, 'classic'
where not exists (select 1 from menu_items where name = 'Teriyaki');

insert into menu_items (name, price, sizes, ingredients, category)
select 'Build Your Own', 21.95, '{"small":19.95,"medium":21.95,"large":24.95}'::jsonb, '{"small":{"Sushi Rice":0.16,"Atlantic Salmon":0.112,"Cucumber":0.5,"Avocado":0.5,"Crab Salad":0.05,"Maple Soy":0.03},"medium":{"Sushi Rice":0.2,"Atlantic Salmon":0.14,"Cucumber":0.5,"Avocado":0.5,"Crab Salad":0.05,"Maple Soy":0.03},"large":{"Sushi Rice":0.25,"Atlantic Salmon":0.175,"Cucumber":0.5,"Avocado":0.5,"Crab Salad":0.05,"Maple Soy":0.03}}'::jsonb, 'byo'
where not exists (select 1 from menu_items where name = 'Build Your Own');

insert into menu_items (name, price, sizes, ingredients, category)
select 'No Protein Bowl', 12.95, '{"small":12.95,"medium":12.95,"large":12.95}'::jsonb, '{"small":{"Sushi Rice":0.16,"Cucumber":0.5,"Avocado":0.5,"Maple Soy":0.03},"medium":{"Sushi Rice":0.2,"Cucumber":0.5,"Avocado":0.5,"Maple Soy":0.03},"large":{"Sushi Rice":0.25,"Cucumber":0.5,"Avocado":0.5,"Maple Soy":0.03}}'::jsonb, 'byo'
where not exists (select 1 from menu_items where name = 'No Protein Bowl');

insert into menu_items (name, price, sizes, ingredients, category)
select 'Miso Soup', 2.5, '{"small":2.5,"medium":2.5,"large":2.5}'::jsonb, '{"small":{"Housemade Miso Soup":0.3,"Charred Nori Oil":0.005,"Scallion":0.005},"medium":{"Housemade Miso Soup":0.3,"Charred Nori Oil":0.005,"Scallion":0.005},"large":{"Housemade Miso Soup":0.3,"Charred Nori Oil":0.005,"Scallion":0.005}}'::jsonb, 'side'
where not exists (select 1 from menu_items where name = 'Miso Soup');

insert into menu_items (name, price, sizes, ingredients, category)
select 'Westcoast Salad', 7.95, '{"small":7.95,"medium":7.95,"large":7.95}'::jsonb, '{"small":{"Crab Salad":0.08,"Avocado":0.5,"Cucumber":0.5,"Mango":0.25,"Scallion":0.01,"Miso Ginger Soy":0.02,"Maple Soy":0.02,"Fried Onion":0.01,"Tempura Crunch":0.01,"Chopped Nori":0.003},"medium":{"Crab Salad":0.08,"Avocado":0.5,"Cucumber":0.5,"Mango":0.25,"Scallion":0.01,"Miso Ginger Soy":0.02,"Maple Soy":0.02,"Fried Onion":0.01,"Tempura Crunch":0.01,"Chopped Nori":0.003},"large":{"Crab Salad":0.08,"Avocado":0.5,"Cucumber":0.5,"Mango":0.25,"Scallion":0.01,"Miso Ginger Soy":0.02,"Maple Soy":0.02,"Fried Onion":0.01,"Tempura Crunch":0.01,"Chopped Nori":0.003}}'::jsonb, 'side'
where not exists (select 1 from menu_items where name = 'Westcoast Salad');

insert into menu_items (name, price, sizes, ingredients, category)
select 'Fruit Salad', 5.95, '{"small":5.95,"medium":5.95,"large":5.95}'::jsonb, '{"small":{"Mango":0.3,"Pineapple":0.3,"Cilantro":0.003,"Togarashi":0.002,"Chili Oil":0.005},"medium":{"Mango":0.3,"Pineapple":0.3,"Cilantro":0.003,"Togarashi":0.002,"Chili Oil":0.005},"large":{"Mango":0.3,"Pineapple":0.3,"Cilantro":0.003,"Togarashi":0.002,"Chili Oil":0.005}}'::jsonb, 'side'
where not exists (select 1 from menu_items where name = 'Fruit Salad');

insert into menu_items (name, price, sizes, ingredients, category)
select 'Wakame Salad', 5.95, '{"small":5.95,"medium":5.95,"large":5.95}'::jsonb, '{"small":{"Wakame Salad":0.15},"medium":{"Wakame Salad":0.15},"large":{"Wakame Salad":0.15}}'::jsonb, 'side'
where not exists (select 1 from menu_items where name = 'Wakame Salad');

insert into menu_items (name, price, sizes, ingredients, category)
select 'Side Rice', 2.5, '{"small":2.5,"medium":2.5,"large":2.5}'::jsonb, '{"small":{"Sushi Rice":0.2},"medium":{"Sushi Rice":0.2},"large":{"Sushi Rice":0.2}}'::jsonb, 'side'
where not exists (select 1 from menu_items where name = 'Side Rice');

insert into menu_items (name, price, sizes, ingredients, category)
select 'Coca-Cola', 2.5, '{"small":2.5,"medium":2.5,"large":2.5}'::jsonb, '{"small":{"Coca-Cola":1},"medium":{"Coca-Cola":1},"large":{"Coca-Cola":1}}'::jsonb, 'drink'
where not exists (select 1 from menu_items where name = 'Coca-Cola');

insert into menu_items (name, price, sizes, ingredients, category)
select 'Diet Coke', 2.5, '{"small":2.5,"medium":2.5,"large":2.5}'::jsonb, '{"small":{"Diet Coke":1},"medium":{"Diet Coke":1},"large":{"Diet Coke":1}}'::jsonb, 'drink'
where not exists (select 1 from menu_items where name = 'Diet Coke');

insert into menu_items (name, price, sizes, ingredients, category)
select 'Coke Zero', 2.5, '{"small":2.5,"medium":2.5,"large":2.5}'::jsonb, '{"small":{"Coke Zero":1},"medium":{"Coke Zero":1},"large":{"Coke Zero":1}}'::jsonb, 'drink'
where not exists (select 1 from menu_items where name = 'Coke Zero');

insert into menu_items (name, price, sizes, ingredients, category)
select 'Ginger Ale', 2.5, '{"small":2.5,"medium":2.5,"large":2.5}'::jsonb, '{"small":{"Ginger Ale":1},"medium":{"Ginger Ale":1},"large":{"Ginger Ale":1}}'::jsonb, 'drink'
where not exists (select 1 from menu_items where name = 'Ginger Ale');

insert into menu_items (name, price, sizes, ingredients, category)
select 'TAS Coconut Water', 4.5, '{"small":4.5,"medium":4.5,"large":4.5}'::jsonb, '{"small":{"TAS Coconut Water":1},"medium":{"TAS Coconut Water":1},"large":{"TAS Coconut Water":1}}'::jsonb, 'drink'
where not exists (select 1 from menu_items where name = 'TAS Coconut Water');

insert into menu_items (name, price, sizes, ingredients, category)
select 'Snapple Lemon Tea', 3.5, '{"small":3.5,"medium":3.5,"large":3.5}'::jsonb, '{"small":{"Snapple Lemon Tea":1},"medium":{"Snapple Lemon Tea":1},"large":{"Snapple Lemon Tea":1}}'::jsonb, 'drink'
where not exists (select 1 from menu_items where name = 'Snapple Lemon Tea');

insert into menu_items (name, price, sizes, ingredients, category)
select 'Bubly Lime', 2.5, '{"small":2.5,"medium":2.5,"large":2.5}'::jsonb, '{"small":{"Bubly Lime":1},"medium":{"Bubly Lime":1},"large":{"Bubly Lime":1}}'::jsonb, 'drink'
where not exists (select 1 from menu_items where name = 'Bubly Lime');

insert into menu_items (name, price, sizes, ingredients, category)
select 'Bubly Grapefruit', 2.5, '{"small":2.5,"medium":2.5,"large":2.5}'::jsonb, '{"small":{"Bubly Grapefruit":1},"medium":{"Bubly Grapefruit":1},"large":{"Bubly Grapefruit":1}}'::jsonb, 'drink'
where not exists (select 1 from menu_items where name = 'Bubly Grapefruit');

insert into menu_items (name, price, sizes, ingredients, category)
select 'Bubly Peach', 2.5, '{"small":2.5,"medium":2.5,"large":2.5}'::jsonb, '{"small":{"Bubly Peach":1},"medium":{"Bubly Peach":1},"large":{"Bubly Peach":1}}'::jsonb, 'drink'
where not exists (select 1 from menu_items where name = 'Bubly Peach');

insert into menu_items (name, price, sizes, ingredients, category)
select 'Bubly Pineapple', 2.5, '{"small":2.5,"medium":2.5,"large":2.5}'::jsonb, '{"small":{"Bubly Pineapple":1},"medium":{"Bubly Pineapple":1},"large":{"Bubly Pineapple":1}}'::jsonb, 'drink'
where not exists (select 1 from menu_items where name = 'Bubly Pineapple');

insert into menu_items (name, price, sizes, ingredients, category)
select 'Aquafina', 2.95, '{"small":2.95,"medium":2.95,"large":2.95}'::jsonb, '{"small":{"Aquafina":1},"medium":{"Aquafina":1},"large":{"Aquafina":1}}'::jsonb, 'drink'
where not exists (select 1 from menu_items where name = 'Aquafina');

insert into menu_items (name, price, sizes, ingredients, category)
select 'San Pellegrino Aranciata Rossa', 3.5, '{"small":3.5,"medium":3.5,"large":3.5}'::jsonb, '{"small":{"San Pellegrino Aranciata Rossa":1},"medium":{"San Pellegrino Aranciata Rossa":1},"large":{"San Pellegrino Aranciata Rossa":1}}'::jsonb, 'drink'
where not exists (select 1 from menu_items where name = 'San Pellegrino Aranciata Rossa');
