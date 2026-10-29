## prompt
    -Create a local browser based game similair to text based games drug wars or dope wars. Rather than illicit items we are buying ai chips. shop cities around the world for the best deals but be careful, it's a risky business,
    
    The Concept: players act as an AI tech bro/bae trying to outfit their datacenters, youi start out in a random location with 5,500 to buy ai chips
    The Goal: You have 30 days to pay back your loan and make a profit before an IPO
    The Risks: Along the way, players manage fluctuating prices, work around technical advancements making old gear noticably loose value (such as 10x vram increase), 50x quantization (local llm takes over business demand and the value of equipment is negatively impacted), and deal with random events like sanctioned by local governments or pallets of chips go missing when changing cities, cities will all have varying costs for each chip, cost changes when changing cities,

    Check all logic and point out any imblanaces or missed desicions.

## Style
- Game will be black background with green text similar to old console games
- splash screen landing page will display AI WARS! in pixel art text, center will be the story hook: (You are an AI tech bro/bae at <company> trying to outfit your datacenters, you have 5,500$ and 30 days to turn a profit before your IPO), Below hook is a start new game button, below that are place holder links to github, and  social media.
- In game view is 3 columns: with chip names, amounts, buy and sell buttons next to small up down arrows for quantity, bottom of screen will have buttons for 6 location names, bottom area that holds location names will be replaced by any dialog (like oh no a pallet was stolen loose 200$), Clicking ok removes the dialog and shows the location names. clicking on a location name starts the next turn,above the table will be current amount of money and turn number,players inventory for a displayed item will be displayed next to market price in split-pane layout


## Mechanics

- When a new game is created user can pick a company name from a list, 6 locations are chosen at random and are fixed until starting new game
- when game starts user can see a list of 12 random chip names next to their price, chip names and prices should be layed out in columns for easy read ability,
- turns: each turn you can buy or sell which subtracts or adds to your money total, prices of chips will randomly fluctuate when changing cities, There is not a history of last purchase price, money will simply be added and subtracted, each turn gives a small chance of a risk happening, if a risk happens money is deducted from players total, a new turn starts when you select a new location
- end game: on turn 31 if player has more than 5500 they win and a the board is replaced with a message (congrats you are the alpha AI tech bro/bae and generated a profit of <player end amount>  for <company>. The first ever profitable AI company!), if player has 5500 on turn 31 they get a message (You payed your loan off. Yay,no cement shoes! Unfortunatley you will live a life of mockery for your poor decisions and bad luck.), if on turn 31 player has less than 5500 the get the message (you didn't pay your loan in time. It's not that you lost everything, it's not that you have nothing to show for your efforts, it's more coming to terms with not being able to itch your feet in cement shoes!), any end game screen also shows the start new button and social media share links,
- Risks are chosen at random when a new location is selected and have a random percent impact on player total (player has been affected by rand(risk) and lost an percentage ammount rand(range(0.01,6.00)), playerTotal = playerTotal-(playertotal x rand(range(0.01,6.00)).
- score is largest amount of money on turn 31, stored in browser and clears when clearing cache and cookies,

## Company names
- Lentil
- VideoChip
- Anychip
- Shiney Semiconductors
- Frugal
- Amazing services
- Sumon electrics
- Fasterthanus
- whorwe
- SMuC
- SMoore
- Brain tech
- Camelcon
- outflame

## locations
- Santa Clara, California, USA
- Hsinchu, Taiwan
- Mountain View Sunnyvale California, USA
- Sunnyvale California, USA
- Seattle, Washington, USA
- Suwon, South Korea
- Hokkaido Japan
- Shenzhen China
- Shanghai China
- Beijing China

## Chip names
- Buckwell 
- Flopster
- Extinct 
- FakeASIC
- Vera Ruine 
- Ironwoodworm
- Drainium
- Onchip
- LowPerformanceUnit
- Descend
- FauxFoundry
- ForgetfulMemory
- Shreds
- Brain tech
- Camelcon
- outflame

## Risks and negative impact on player total 
- Fluctuating prices
- Compititor advancements making old gear noticably loose value (such as 10x vram increase), 50x quantization (local llm takes over business demand and the value of equipment is negatively impacted), 
- Sanctioned by local governments or 
- pallets of chips go missing when changing cities, cities will all have varying costs for each chip, cost changes when changing cities,

## Risk penalities
- Players encountering a risk will loose a percentage of they total money, amount lost is randomly selected value between %0.01 and 6%, round up in all to nearst ones place in all cases.

## Architecture
- Web based local at first, I want to test in my local browser. react next js, test with vitest and jsdom 