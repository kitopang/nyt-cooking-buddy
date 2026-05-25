## NYT Cooking Buddy
This project aims to automate the parts of home cooking that have the most friction — deciding recipes & grocery shopping — allowing you to focus on enjoying cooking.

This is the high level workflow done through a Chrome extension + local server:
1. Build a recipe list in NYT Cooking
2. Aggregate ingredients needed among all recipes using Claude
3. De-select and alter shopping list
4. Order autonomously on Amazon Fresh using a Claude + Playwright agent

# Why I built this
I enjoy the act of cooking, but don't appreciate the time & energy it takes to prepare for it. My typical Monday used to look like the following: 

1. Get off at work around 6, walk about half a mile to the nearby Trader Joes
2. Buy ingredients that _seem_ like they could be versitile, but have no real plans regarding what recipes to make
3. Wait in a massive line and then carry ingredients back on the crowded 6 train
5. End up with a ton of leftover ingredients

I started dreading this process and started leaning into eating out more, which wasn't ideal for staying healthy and not going broke. 

I first tried going to grocery stores closer to home to ease the pain of going to a crowded Trader Joe's, but local prices and quality just wasn't great. I found myself paying at least 40% more on regular items that tasted worse than TJs. 

My next option was trying a meal-kit service (Hungryroot). Initially, I loved how easy it was to plan out my week and get stuff delivered straight to my door. I had zero food waste and saved a good chunk of hassle not having to buy groceries. But, a major downside for me was how basic the meals were, the overall cost, and the lack of selection outside the curated meal choices were. For instance, I was paying 150/week to get turkey burgers (literally just turkey patty + cheese + bread) or plain chicken with potatoes. It was also hard finding the snacks, fruit, and other side items I would get from a grocery store without paying a fortune or being stuck with some weird off-brand. 

Feeling deeply unsatisfied with existing options, I decided to build my own project. I chose NYT Cooking because it draws from hundreds of local chefs and is extremely popular -- allowing me to try recipes that are unique and stand out. I also chose Amazon Fresh as the supplier since its cheap, has insane delivery windows (same day), and has almost every product under the sun. 
