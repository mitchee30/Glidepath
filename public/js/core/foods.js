// Built-in food table (per 100 g, as eaten). Values are rounded typical values
// from USDA FoodData Central and common Chinese food-composition tables; mixed
// dishes vary a lot between kitchens, so treat them as starting estimates.
//
// k = kcal, p = protein g, c = carbs g, f = fat g, g = default portion grams,
// u = portion label [zh, en], plain = a basic ingredient whose cooking oil is
// NOT included (the cooking selector adds it); dishes already include oil.

export const FOOD_CATEGORIES = ['staple', 'protein', 'dairy', 'veg', 'fruit', 'dish', 'fastfood', 'snack', 'drink', 'fat'];

export const FOODS = [
  // staples
  { id: 'rice', cat: 'staple', zh: '米饭', en: 'White rice, cooked', k: 130, p: 2.7, c: 28.2, f: 0.3, g: 150, u: ['1 碗', '1 bowl'], alias: '白米饭 大米 rice steamed' },
  { id: 'brown_rice', cat: 'staple', zh: '糙米饭', en: 'Brown rice, cooked', k: 123, p: 2.7, c: 25.6, f: 1.0, g: 150, u: ['1 碗', '1 bowl'], alias: '杂粮饭' },
  { id: 'congee', cat: 'staple', zh: '白粥', en: 'Rice porridge (congee)', k: 46, p: 1.1, c: 9.9, f: 0.1, g: 300, u: ['1 碗', '1 bowl'], alias: '稀饭 大米粥 porridge' },
  { id: 'noodles', cat: 'staple', zh: '面条（煮熟）', en: 'Wheat noodles, cooked', k: 137, p: 4.5, c: 25.0, f: 2.1, g: 200, u: ['1 碗', '1 bowl'], alias: '挂面 拉面 noodle' },
  { id: 'pasta', cat: 'staple', zh: '意大利面（煮熟）', en: 'Pasta, cooked', k: 158, p: 5.8, c: 31.0, f: 0.9, g: 200, u: ['1 盘', '1 plate'], alias: 'spaghetti 意面' },
  { id: 'rice_noodles', cat: 'staple', zh: '米粉/河粉（煮熟）', en: 'Rice noodles, cooked', k: 108, p: 1.8, c: 24.0, f: 0.2, g: 200, u: ['1 碗', '1 bowl'], alias: '米线 pho' },
  { id: 'instant_noodles', cat: 'staple', zh: '方便面（干面饼）', en: 'Instant noodles (dry block)', k: 450, p: 9.0, c: 60.0, f: 19.0, g: 85, u: ['1 包', '1 pack'], alias: '泡面 ramen' },
  { id: 'mantou', cat: 'staple', zh: '馒头', en: 'Steamed bun (plain)', k: 223, p: 7.0, c: 47.0, f: 1.1, g: 100, u: ['1 个', '1 bun'], alias: '白馒头' },
  { id: 'baozi', cat: 'staple', zh: '肉包子', en: 'Pork bun (baozi)', k: 230, p: 8.0, c: 30.0, f: 8.5, g: 90, u: ['1 个', '1 bun'], alias: '包子 bao' },
  { id: 'dumplings', cat: 'staple', zh: '猪肉水饺', en: 'Pork dumplings, boiled', k: 220, p: 9.0, c: 25.0, f: 9.0, g: 220, u: ['10 个', '10 pcs'], alias: '饺子 jiaozi dumpling' },
  { id: 'white_bread', cat: 'staple', zh: '白吐司', en: 'White bread', k: 265, p: 9.0, c: 49.0, f: 3.2, g: 30, u: ['1 片', '1 slice'], alias: '面包 吐司 toast' },
  { id: 'wholewheat_bread', cat: 'staple', zh: '全麦面包', en: 'Whole-wheat bread', k: 252, p: 12.4, c: 43.0, f: 3.5, g: 32, u: ['1 片', '1 slice'], alias: 'whole wheat' },
  { id: 'bagel', cat: 'staple', zh: '贝果', en: 'Bagel', k: 250, p: 10.0, c: 49.0, f: 1.5, g: 100, u: ['1 个', '1 bagel'], alias: '' },
  { id: 'oatmeal', cat: 'staple', zh: '燕麦粥（水煮）', en: 'Oatmeal, cooked with water', k: 71, p: 2.5, c: 12.0, f: 1.5, g: 250, u: ['1 碗', '1 bowl'], alias: '麦片粥 porridge oats' },
  { id: 'oats_dry', cat: 'staple', zh: '燕麦片（干）', en: 'Rolled oats, dry', k: 379, p: 13.0, c: 68.0, f: 6.5, g: 40, u: ['半杯', '1/2 cup'], alias: '燕麦 oats' },
  { id: 'potato', cat: 'staple', zh: '土豆', en: 'Potato', k: 87, p: 1.9, c: 20.0, f: 0.1, g: 150, u: ['1 个', '1 potato'], plain: true, alias: '马铃薯 洋芋' },
  { id: 'sweet_potato', cat: 'staple', zh: '红薯', en: 'Sweet potato', k: 86, p: 1.6, c: 20.0, f: 0.1, g: 200, u: ['1 个', '1 potato'], plain: true, alias: '地瓜 番薯 红苕' },
  { id: 'corn', cat: 'staple', zh: '玉米', en: 'Corn on the cob', k: 96, p: 3.4, c: 21.0, f: 1.5, g: 100, u: ['1 根', '1 ear'], plain: true, alias: '玉米棒 苞米' },

  // protein
  { id: 'chicken_breast', cat: 'protein', zh: '鸡胸肉', en: 'Chicken breast, cooked', k: 165, p: 31.0, c: 0, f: 3.6, g: 120, u: ['1 块', '1 piece'], plain: true, alias: '鸡胸 chicken' },
  { id: 'chicken_thigh', cat: 'protein', zh: '鸡腿肉（去皮）', en: 'Chicken thigh, skinless, cooked', k: 209, p: 26.0, c: 0, f: 10.9, g: 100, u: ['1 只', '1 thigh'], plain: true, alias: '鸡腿 chicken leg' },
  { id: 'fried_chicken', cat: 'protein', zh: '炸鸡', en: 'Fried chicken (breaded)', k: 275, p: 22.0, c: 10.0, f: 16.0, g: 120, u: ['1 块', '1 piece'], alias: '炸鸡块 鸡排 fried chicken' },
  { id: 'beef_lean', cat: 'protein', zh: '瘦牛肉', en: 'Lean beef, cooked', k: 217, p: 26.0, c: 0, f: 12.0, g: 100, u: ['1 份', '1 serving'], plain: true, alias: '牛肉 牛排 beef steak' },
  { id: 'pork_lean', cat: 'protein', zh: '瘦猪肉', en: 'Lean pork, cooked', k: 206, p: 29.0, c: 0, f: 9.0, g: 100, u: ['1 份', '1 serving'], plain: true, alias: '猪肉 里脊 pork' },
  { id: 'salmon', cat: 'protein', zh: '三文鱼', en: 'Salmon, cooked', k: 206, p: 22.0, c: 0, f: 12.0, g: 120, u: ['1 块', '1 fillet'], plain: true, alias: '鲑鱼 salmon' },
  { id: 'white_fish', cat: 'protein', zh: '白肉鱼（鳕鱼等）', en: 'White fish (cod etc.), cooked', k: 105, p: 23.0, c: 0, f: 0.9, g: 120, u: ['1 块', '1 fillet'], plain: true, alias: '鱼 鳕鱼 龙利鱼 tilapia fish' },
  { id: 'shrimp', cat: 'protein', zh: '虾', en: 'Shrimp, cooked', k: 99, p: 24.0, c: 0.2, f: 0.3, g: 100, u: ['1 份', '1 serving'], plain: true, alias: '虾仁 prawn' },
  { id: 'egg', cat: 'protein', zh: '鸡蛋', en: 'Egg', k: 155, p: 13.0, c: 1.1, f: 11.0, g: 50, u: ['1 个', '1 egg'], plain: true, alias: '水煮蛋 煎蛋 egg' },
  { id: 'egg_white', cat: 'protein', zh: '蛋白', en: 'Egg white', k: 52, p: 11.0, c: 0.7, f: 0.2, g: 33, u: ['1 个', '1 white'], plain: true, alias: '蛋清' },
  { id: 'tofu_firm', cat: 'protein', zh: '老豆腐', en: 'Firm tofu', k: 120, p: 13.0, c: 2.0, f: 7.0, g: 150, u: ['1 块', '1 block'], plain: true, alias: '北豆腐 豆腐 tofu' },
  { id: 'tofu_soft', cat: 'protein', zh: '嫩豆腐', en: 'Soft tofu', k: 60, p: 5.0, c: 2.0, f: 3.0, g: 150, u: ['1 块', '1 block'], plain: true, alias: '南豆腐 内酯豆腐 silken' },
  { id: 'tuna_canned', cat: 'protein', zh: '水浸金枪鱼罐头', en: 'Tuna canned in water, drained', k: 116, p: 26.0, c: 0, f: 0.8, g: 100, u: ['1 罐', '1 can'], alias: '吞拿鱼 tuna' },
  { id: 'braised_pork', cat: 'protein', zh: '红烧肉', en: 'Red-braised pork belly', k: 470, p: 10.0, c: 6.0, f: 45.0, g: 100, u: ['1 份', '1 serving'], alias: '五花肉 东坡肉 pork belly' },
  { id: 'sausage', cat: 'protein', zh: '香肠/热狗肠', en: 'Sausage / hot dog', k: 290, p: 10.0, c: 4.0, f: 26.0, g: 50, u: ['1 根', '1 sausage'], alias: '火腿肠 hot dog' },
  { id: 'bacon', cat: 'protein', zh: '培根（熟）', en: 'Bacon, cooked', k: 541, p: 37.0, c: 1.4, f: 42.0, g: 8, u: ['1 片', '1 slice'], alias: '' },
  { id: 'edamame', cat: 'protein', zh: '毛豆', en: 'Edamame', k: 121, p: 12.0, c: 9.0, f: 5.0, g: 100, u: ['1 小碗', '1 small bowl'], plain: true, alias: '' },
  { id: 'whey', cat: 'protein', zh: '乳清蛋白粉', en: 'Whey protein powder', k: 400, p: 80.0, c: 8.0, f: 5.0, g: 30, u: ['1 勺', '1 scoop'], alias: '蛋白粉 protein shake' },

  // dairy & soy drinks
  { id: 'milk', cat: 'dairy', zh: '全脂牛奶', en: 'Whole milk', k: 61, p: 3.2, c: 4.8, f: 3.3, g: 250, u: ['1 杯', '1 cup'], alias: '牛奶 milk' },
  { id: 'milk_skim', cat: 'dairy', zh: '脱脂牛奶', en: 'Skim milk', k: 34, p: 3.4, c: 5.0, f: 0.1, g: 250, u: ['1 杯', '1 cup'], alias: '低脂奶' },
  { id: 'soy_milk', cat: 'dairy', zh: '无糖豆浆', en: 'Soy milk, unsweetened', k: 33, p: 2.9, c: 1.7, f: 1.6, g: 250, u: ['1 杯', '1 cup'], alias: '豆浆 soymilk' },
  { id: 'greek_yogurt', cat: 'dairy', zh: '希腊酸奶（无糖脱脂）', en: 'Greek yogurt, plain nonfat', k: 59, p: 10.0, c: 3.6, f: 0.4, g: 170, u: ['1 杯', '1 cup'], alias: '希腊 酸奶 yogurt' },
  { id: 'yogurt_sweet', cat: 'dairy', zh: '酸奶（加糖）', en: 'Yogurt, sweetened', k: 90, p: 3.0, c: 13.0, f: 3.0, g: 150, u: ['1 杯', '1 cup'], alias: '风味酸奶 yogurt' },
  { id: 'cheese', cat: 'dairy', zh: '奶酪', en: 'Cheddar cheese', k: 403, p: 25.0, c: 1.3, f: 33.0, g: 20, u: ['1 片', '1 slice'], alias: '芝士 cheese' },

  // vegetables (plain)
  { id: 'broccoli', cat: 'veg', zh: '西兰花', en: 'Broccoli', k: 35, p: 2.4, c: 7.2, f: 0.4, g: 150, u: ['1 份', '1 serving'], plain: true, alias: '西蓝花 花菜' },
  { id: 'greens', cat: 'veg', zh: '青菜（小白菜/油菜）', en: 'Leafy greens (bok choy etc.)', k: 15, p: 1.5, c: 2.2, f: 0.2, g: 200, u: ['1 份', '1 serving'], plain: true, alias: '小白菜 上海青 菜心 bok choy' },
  { id: 'spinach', cat: 'veg', zh: '菠菜', en: 'Spinach', k: 23, p: 2.9, c: 3.6, f: 0.4, g: 150, u: ['1 份', '1 serving'], plain: true, alias: '' },
  { id: 'lettuce', cat: 'veg', zh: '生菜', en: 'Lettuce', k: 15, p: 1.4, c: 2.9, f: 0.2, g: 100, u: ['1 份', '1 serving'], plain: true, alias: 'salad 沙拉菜' },
  { id: 'tomato', cat: 'veg', zh: '番茄', en: 'Tomato', k: 18, p: 0.9, c: 3.9, f: 0.2, g: 150, u: ['1 个', '1 tomato'], plain: true, alias: '西红柿' },
  { id: 'cucumber', cat: 'veg', zh: '黄瓜', en: 'Cucumber', k: 15, p: 0.7, c: 3.6, f: 0.1, g: 200, u: ['1 根', '1 cucumber'], plain: true, alias: '' },
  { id: 'carrot', cat: 'veg', zh: '胡萝卜', en: 'Carrot', k: 41, p: 0.9, c: 9.6, f: 0.2, g: 100, u: ['1 根', '1 carrot'], plain: true, alias: '红萝卜' },
  { id: 'cabbage', cat: 'veg', zh: '卷心菜', en: 'Cabbage', k: 25, p: 1.3, c: 5.8, f: 0.1, g: 150, u: ['1 份', '1 serving'], plain: true, alias: '包菜 圆白菜 大白菜' },
  { id: 'eggplant', cat: 'veg', zh: '茄子', en: 'Eggplant', k: 25, p: 1.0, c: 5.9, f: 0.2, g: 150, u: ['1 份', '1 serving'], plain: true, alias: 'aubergine' },
  { id: 'green_beans', cat: 'veg', zh: '四季豆', en: 'Green beans', k: 31, p: 1.8, c: 7.0, f: 0.2, g: 150, u: ['1 份', '1 serving'], plain: true, alias: '豆角 扁豆' },
  { id: 'mushrooms', cat: 'veg', zh: '蘑菇', en: 'Mushrooms', k: 25, p: 3.1, c: 3.3, f: 0.3, g: 100, u: ['1 份', '1 serving'], plain: true, alias: '香菇 平菇 金针菇' },
  { id: 'bean_sprouts', cat: 'veg', zh: '豆芽', en: 'Bean sprouts', k: 30, p: 3.0, c: 5.9, f: 0.2, g: 150, u: ['1 份', '1 serving'], plain: true, alias: '绿豆芽' },
  { id: 'bell_pepper', cat: 'veg', zh: '彩椒/青椒', en: 'Bell pepper', k: 26, p: 1.0, c: 6.0, f: 0.3, g: 100, u: ['1 个', '1 pepper'], plain: true, alias: '辣椒 甜椒' },
  { id: 'onion', cat: 'veg', zh: '洋葱', en: 'Onion', k: 40, p: 1.1, c: 9.3, f: 0.1, g: 100, u: ['半个', '1/2 onion'], plain: true, alias: '' },

  // fruit
  { id: 'apple', cat: 'fruit', zh: '苹果', en: 'Apple', k: 52, p: 0.3, c: 14.0, f: 0.2, g: 180, u: ['1 个', '1 apple'], alias: '' },
  { id: 'banana', cat: 'fruit', zh: '香蕉', en: 'Banana', k: 89, p: 1.1, c: 23.0, f: 0.3, g: 120, u: ['1 根', '1 banana'], alias: '' },
  { id: 'orange', cat: 'fruit', zh: '橙子', en: 'Orange', k: 47, p: 0.9, c: 12.0, f: 0.1, g: 150, u: ['1 个', '1 orange'], alias: '橘子 柑' },
  { id: 'grapes', cat: 'fruit', zh: '葡萄', en: 'Grapes', k: 69, p: 0.7, c: 18.0, f: 0.2, g: 150, u: ['1 小碗', '1 small bowl'], alias: '' },
  { id: 'strawberries', cat: 'fruit', zh: '草莓', en: 'Strawberries', k: 32, p: 0.7, c: 7.7, f: 0.3, g: 150, u: ['1 小碗', '1 small bowl'], alias: '' },
  { id: 'blueberries', cat: 'fruit', zh: '蓝莓', en: 'Blueberries', k: 57, p: 0.7, c: 14.0, f: 0.3, g: 100, u: ['1 小盒', '1 small box'], alias: '' },
  { id: 'watermelon', cat: 'fruit', zh: '西瓜', en: 'Watermelon', k: 30, p: 0.6, c: 7.6, f: 0.2, g: 300, u: ['1 块', '1 slice'], alias: '' },
  { id: 'mango', cat: 'fruit', zh: '芒果', en: 'Mango', k: 60, p: 0.8, c: 15.0, f: 0.4, g: 200, u: ['1 个', '1 mango'], alias: '' },
  { id: 'pear', cat: 'fruit', zh: '梨', en: 'Pear', k: 57, p: 0.4, c: 15.0, f: 0.1, g: 200, u: ['1 个', '1 pear'], alias: '' },
  { id: 'kiwi', cat: 'fruit', zh: '猕猴桃', en: 'Kiwi', k: 61, p: 1.1, c: 15.0, f: 0.5, g: 75, u: ['1 个', '1 kiwi'], alias: '奇异果' },
  { id: 'avocado', cat: 'fruit', zh: '牛油果', en: 'Avocado', k: 160, p: 2.0, c: 8.5, f: 14.7, g: 70, u: ['半个', '1/2 avocado'], alias: '鳄梨' },

  // Chinese dishes (as served, oil included)
  { id: 'tomato_egg', cat: 'dish', zh: '番茄炒蛋', en: 'Tomato & egg stir-fry', k: 110, p: 5.5, c: 5.0, f: 7.5, g: 250, u: ['1 份', '1 plate'], alias: '西红柿炒鸡蛋' },
  { id: 'kungpao', cat: 'dish', zh: '宫保鸡丁', en: 'Kung pao chicken', k: 190, p: 15.0, c: 8.0, f: 11.0, g: 250, u: ['1 份', '1 plate'], alias: '宫爆鸡丁' },
  { id: 'mapo_tofu', cat: 'dish', zh: '麻婆豆腐', en: 'Mapo tofu', k: 140, p: 8.0, c: 5.0, f: 10.0, g: 250, u: ['1 份', '1 plate'], alias: '' },
  { id: 'yuxiang_pork', cat: 'dish', zh: '鱼香肉丝', en: 'Yu-xiang shredded pork', k: 170, p: 10.0, c: 9.0, f: 11.0, g: 250, u: ['1 份', '1 plate'], alias: '' },
  { id: 'pepper_pork', cat: 'dish', zh: '青椒肉丝', en: 'Pork with green pepper', k: 150, p: 11.0, c: 5.0, f: 10.0, g: 250, u: ['1 份', '1 plate'], alias: '' },
  { id: 'stirfried_greens', cat: 'dish', zh: '清炒青菜', en: 'Stir-fried greens', k: 70, p: 1.5, c: 3.0, f: 6.0, g: 200, u: ['1 份', '1 plate'], alias: '炒青菜 炒时蔬' },
  { id: 'disanxian', cat: 'dish', zh: '地三鲜', en: 'Di san xian (eggplant, potato, pepper)', k: 180, p: 2.0, c: 15.0, f: 13.0, g: 250, u: ['1 份', '1 plate'], alias: '' },
  { id: 'twice_cooked_pork', cat: 'dish', zh: '回锅肉', en: 'Twice-cooked pork', k: 280, p: 12.0, c: 5.0, f: 24.0, g: 200, u: ['1 份', '1 plate'], alias: '' },
  { id: 'sweet_sour_pork', cat: 'dish', zh: '糖醋里脊', en: 'Sweet & sour pork', k: 240, p: 12.0, c: 22.0, f: 11.0, g: 200, u: ['1 份', '1 plate'], alias: '咕咾肉 锅包肉' },
  { id: 'fried_rice', cat: 'dish', zh: '蛋炒饭', en: 'Egg fried rice', k: 180, p: 5.0, c: 25.0, f: 6.5, g: 300, u: ['1 份', '1 plate'], alias: '炒饭 扬州炒饭 fried rice' },
  { id: 'chow_mein', cat: 'dish', zh: '炒面', en: 'Chow mein', k: 175, p: 6.0, c: 23.0, f: 6.5, g: 300, u: ['1 份', '1 plate'], alias: '' },
  { id: 'beef_noodle_soup', cat: 'dish', zh: '牛肉面（含汤）', en: 'Beef noodle soup (with broth)', k: 95, p: 5.0, c: 12.0, f: 3.0, g: 600, u: ['1 碗', '1 bowl'], alias: '兰州拉面 汤面' },
  { id: 'malatang', cat: 'dish', zh: '麻辣烫（含汤料）', en: 'Malatang (spicy hot pot bowl)', k: 100, p: 5.0, c: 8.0, f: 5.5, g: 500, u: ['1 碗', '1 bowl'], alias: '麻辣香锅 冒菜' },
  { id: 'potstickers', cat: 'dish', zh: '煎饺/锅贴', en: 'Pan-fried dumplings', k: 250, p: 9.0, c: 25.0, f: 12.0, g: 250, u: ['10 个', '10 pcs'], alias: '锅贴 gyoza' },
  { id: 'xiaolongbao', cat: 'dish', zh: '小笼包', en: 'Soup dumplings', k: 230, p: 9.0, c: 25.0, f: 10.0, g: 200, u: ['1 笼（8 个）', '1 basket (8)'], alias: '灌汤包 xlb' },
  { id: 'youtiao', cat: 'dish', zh: '油条', en: 'Fried dough stick', k: 386, p: 7.0, c: 51.0, f: 18.0, g: 60, u: ['1 根', '1 stick'], alias: '' },
  { id: 'jianbing', cat: 'dish', zh: '煎饼果子', en: 'Jianbing (crepe)', k: 230, p: 7.0, c: 30.0, f: 9.0, g: 250, u: ['1 个', '1 crepe'], alias: '煎饼' },
  { id: 'liangpi', cat: 'dish', zh: '凉皮', en: 'Liangpi (cold noodles)', k: 140, p: 4.0, c: 25.0, f: 3.0, g: 300, u: ['1 份', '1 serving'], alias: '凉面' },
  { id: 'braised_pork_rice', cat: 'dish', zh: '卤肉饭', en: 'Braised pork rice', k: 190, p: 7.0, c: 24.0, f: 7.5, g: 350, u: ['1 碗', '1 bowl'], alias: '' },
  { id: 'curry_rice', cat: 'dish', zh: '咖喱饭', en: 'Curry rice', k: 150, p: 5.0, c: 22.0, f: 5.0, g: 400, u: ['1 份', '1 plate'], alias: 'curry' },
  { id: 'sushi', cat: 'dish', zh: '寿司卷', en: 'Sushi roll', k: 145, p: 5.0, c: 28.0, f: 1.5, g: 150, u: ['6 个', '6 pcs'], alias: 'maki 寿司' },

  // fast food
  { id: 'burger', cat: 'fastfood', zh: '牛肉汉堡', en: 'Beef burger', k: 250, p: 12.0, c: 31.0, f: 9.0, g: 200, u: ['1 个', '1 burger'], alias: '汉堡 hamburger' },
  { id: 'fries', cat: 'fastfood', zh: '薯条', en: 'French fries', k: 312, p: 3.4, c: 41.0, f: 15.0, g: 115, u: ['中份', 'medium'], alias: 'fries chips' },
  { id: 'pizza', cat: 'fastfood', zh: '芝士披萨', en: 'Cheese pizza', k: 266, p: 11.0, c: 33.0, f: 10.0, g: 110, u: ['1 片', '1 slice'], alias: '比萨 pizza' },
  { id: 'sandwich', cat: 'fastfood', zh: '三明治（火腿/鸡肉）', en: 'Sandwich (ham/chicken)', k: 230, p: 12.0, c: 26.0, f: 8.5, g: 200, u: ['1 个', '1 sandwich'], alias: 'sub 赛百味' },

  // snacks & sweets
  { id: 'chocolate', cat: 'snack', zh: '牛奶巧克力', en: 'Milk chocolate', k: 535, p: 7.7, c: 59.0, f: 30.0, g: 25, u: ['1 小块', '1 small bar'], alias: '巧克力 chocolate' },
  { id: 'cookie', cat: 'snack', zh: '曲奇饼干', en: 'Cookie', k: 480, p: 5.0, c: 65.0, f: 23.0, g: 15, u: ['1 块', '1 cookie'], alias: '饼干 cookies biscuit' },
  { id: 'chips', cat: 'snack', zh: '薯片', en: 'Potato chips', k: 536, p: 7.0, c: 53.0, f: 35.0, g: 30, u: ['1 小包', '1 small bag'], alias: 'crisps' },
  { id: 'ice_cream', cat: 'snack', zh: '冰淇淋', en: 'Ice cream', k: 207, p: 3.5, c: 24.0, f: 11.0, g: 70, u: ['1 球', '1 scoop'], alias: '雪糕' },
  { id: 'cake', cat: 'snack', zh: '奶油蛋糕', en: 'Cream cake', k: 350, p: 4.0, c: 45.0, f: 17.0, g: 100, u: ['1 块', '1 slice'], alias: '蛋糕 cake' },
  { id: 'peanuts', cat: 'snack', zh: '花生', en: 'Peanuts', k: 567, p: 26.0, c: 16.0, f: 49.0, g: 30, u: ['1 小把', '1 handful'], alias: '' },
  { id: 'almonds', cat: 'snack', zh: '杏仁', en: 'Almonds', k: 579, p: 21.0, c: 22.0, f: 50.0, g: 30, u: ['1 小把', '1 handful'], alias: '巴旦木 nuts' },
  { id: 'walnuts', cat: 'snack', zh: '核桃', en: 'Walnuts', k: 654, p: 15.0, c: 14.0, f: 65.0, g: 30, u: ['1 小把', '1 handful'], alias: '' },

  // drinks
  { id: 'bubble_tea', cat: 'drink', zh: '珍珠奶茶（全糖）', en: 'Bubble milk tea (full sugar)', k: 75, p: 0.8, c: 13.0, f: 2.3, g: 500, u: ['1 杯', '1 cup'], alias: '奶茶 波霸 boba milk tea' },
  { id: 'milk_tea_nosugar', cat: 'drink', zh: '奶茶（无糖，无小料）', en: 'Milk tea, no sugar, no toppings', k: 35, p: 1.0, c: 3.0, f: 2.0, g: 500, u: ['1 杯', '1 cup'], alias: '无糖奶茶' },
  { id: 'latte', cat: 'drink', zh: '拿铁（无糖）', en: 'Latte, unsweetened', k: 45, p: 2.5, c: 3.6, f: 2.4, g: 350, u: ['1 杯', '1 cup'], alias: '咖啡 latte coffee' },
  { id: 'black_coffee', cat: 'drink', zh: '黑咖啡/美式', en: 'Black coffee', k: 1, p: 0.1, c: 0, f: 0, g: 250, u: ['1 杯', '1 cup'], alias: '美式 americano coffee' },
  { id: 'cola', cat: 'drink', zh: '可乐', en: 'Cola', k: 42, p: 0, c: 10.6, f: 0, g: 355, u: ['1 罐', '1 can'], alias: '汽水 soda coke' },
  { id: 'orange_juice', cat: 'drink', zh: '橙汁', en: 'Orange juice', k: 45, p: 0.7, c: 10.4, f: 0.2, g: 250, u: ['1 杯', '1 glass'], alias: '果汁 juice' },
  { id: 'beer', cat: 'drink', zh: '啤酒', en: 'Beer', k: 43, p: 0.5, c: 3.6, f: 0, g: 355, u: ['1 罐', '1 can'], alias: 'beer' },
  { id: 'wine', cat: 'drink', zh: '红酒', en: 'Red wine', k: 85, p: 0.1, c: 2.6, f: 0, g: 150, u: ['1 杯', '1 glass'], alias: '葡萄酒 wine' },

  // fats
  { id: 'oil', cat: 'fat', zh: '食用油', en: 'Cooking oil', k: 884, p: 0, c: 0, f: 100, g: 13, u: ['1 汤匙', '1 tbsp'], alias: '油 橄榄油 oil' },
  { id: 'butter', cat: 'fat', zh: '黄油', en: 'Butter', k: 717, p: 0.9, c: 0.1, f: 81.0, g: 10, u: ['1 小块', '1 pat'], alias: '' },
  { id: 'peanut_butter', cat: 'fat', zh: '花生酱', en: 'Peanut butter', k: 588, p: 25.0, c: 20.0, f: 50.0, g: 16, u: ['1 汤匙', '1 tbsp'], alias: '' },
  { id: 'mayo', cat: 'fat', zh: '蛋黄酱/沙拉酱', en: 'Mayonnaise', k: 680, p: 1.0, c: 0.6, f: 75.0, g: 15, u: ['1 汤匙', '1 tbsp'], alias: '沙拉酱 dressing' },
];

const BY_ID = new Map(FOODS.map((f) => [f.id, f]));

export function getFood(id) {
  return BY_ID.get(id) || null;
}

function norm(s) {
  return String(s || '').toLowerCase().replace(/[\s（）()，,/·-]+/g, '');
}

/** Simple ranked search over names and aliases (zh and en). */
export function searchFoods(query, limit = 20) {
  const q = norm(query);
  if (!q) return [];
  const scored = [];
  for (const f of FOODS) {
    const names = [f.zh, f.en, ...String(f.alias || '').split(/\s+/)].map(norm).filter(Boolean);
    let score = 0;
    for (const n of names) {
      if (n === q) score = Math.max(score, 100);
      else if (n.startsWith(q)) score = Math.max(score, 60);
      else if (n.includes(q)) score = Math.max(score, 40);
      else if (q.length >= 2 && q.includes(n) && n.length >= 2) score = Math.max(score, 20);
    }
    if (score) scored.push({ f, score });
  }
  scored.sort((a, b) => b.score - a.score || a.f.zh.length - b.f.zh.length);
  return scored.slice(0, limit).map((s) => s.f);
}

/** Protein-rich picks, used for "how to reach your protein" tips. */
export function proteinIdeas(diet) {
  const veg = ['tofu_firm', 'edamame', 'greek_yogurt', 'egg', 'soy_milk', 'milk_skim'];
  const vegan = ['tofu_firm', 'edamame', 'soy_milk', 'peanuts'];
  const all = ['chicken_breast', 'egg', 'greek_yogurt', 'white_fish', 'tofu_firm', 'shrimp', 'beef_lean'];
  const ids = diet === 'vegan' ? vegan : diet === 'vegetarian' ? veg : all;
  return ids.map(getFood).filter(Boolean);
}
