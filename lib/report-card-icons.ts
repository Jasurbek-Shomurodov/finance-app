// The line icons the report picture draws: the app's own lucide icons, rendered once to their SVG shapes so the card
// can place them anywhere at any size and colour. Server-side only, like the rest of the picture.
import {createElement,type ComponentType} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ArrowDown,ArrowUp,ArrowUpDown,Briefcase,Building2,Calendar,ChartColumn,Coins,Ellipsis,HandCoins,Heart,House,Landmark,PiggyBank,ShieldCheck,Store,Tag,TrendingUp,User,Wallet} from 'lucide-react';
const icons={arrowDown:ArrowDown,arrowUp:ArrowUp,arrowUpDown:ArrowUpDown,briefcase:Briefcase,building:Building2,calendar:Calendar,chart:ChartColumn,coins:Coins,ellipsis:Ellipsis,handCoins:HandCoins,heart:Heart,house:House,landmark:Landmark,piggyBank:PiggyBank,shield:ShieldCheck,store:Store,tag:Tag,trendingUp:TrendingUp,user:User,wallet:Wallet} satisfies Record<string,ComponentType>;
export type CardIcon=keyof typeof icons;
const shapes=new Map<CardIcon,string>();
/** The icon's shapes on its 24-pixel grid, without the outer <svg>: strokes take the colour of the group around them. */
export function iconShapes(name:CardIcon):string{
 let shape=shapes.get(name);
 if(shape===undefined){
  shape=renderToStaticMarkup(createElement(icons[name])).replace(/^<svg[^>]*>|<\/svg>$/g,'');
  shapes.set(name,shape);
 }
 return shape;
}
/** The icon of a built-in category or income kind, and of each place money went; an added category is a tag. */
const kindIcons:Record<string,CardIcon>={'Living expense':'house','Rent expense':'building','Charity':'heart','Other expense':'ellipsis',Salary:'briefcase','Rent income':'building','Business income':'store','Other income':'coins'};
export const kindIcon=(kind:string):CardIcon=>kindIcons[kind]??'tag';
