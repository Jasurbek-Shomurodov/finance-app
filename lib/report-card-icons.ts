// The line icons the report picture draws: the app's own lucide icons, written out from their shape data so the card
// can place them anywhere at any size and colour. Server-side only, like the rest of the picture. The shapes are read
// straight from lucide rather than rendered with react-dom/server, which a Next.js route handler may not import.
import {__iconNode as arrowDown} from 'lucide-react/dist/esm/icons/arrow-down.mjs';
import {__iconNode as arrowUp} from 'lucide-react/dist/esm/icons/arrow-up.mjs';
import {__iconNode as arrowUpDown} from 'lucide-react/dist/esm/icons/arrow-up-down.mjs';
import {__iconNode as briefcase} from 'lucide-react/dist/esm/icons/briefcase.mjs';
import {__iconNode as building} from 'lucide-react/dist/esm/icons/building-2.mjs';
import {__iconNode as calendar} from 'lucide-react/dist/esm/icons/calendar.mjs';
import {__iconNode as chart} from 'lucide-react/dist/esm/icons/chart-column.mjs';
import {__iconNode as coins} from 'lucide-react/dist/esm/icons/coins.mjs';
import {__iconNode as ellipsis} from 'lucide-react/dist/esm/icons/ellipsis.mjs';
import {__iconNode as handCoins} from 'lucide-react/dist/esm/icons/hand-coins.mjs';
import {__iconNode as heart} from 'lucide-react/dist/esm/icons/heart.mjs';
import {__iconNode as house} from 'lucide-react/dist/esm/icons/house.mjs';
import {__iconNode as landmark} from 'lucide-react/dist/esm/icons/landmark.mjs';
import {__iconNode as piggyBank} from 'lucide-react/dist/esm/icons/piggy-bank.mjs';
import {__iconNode as shield} from 'lucide-react/dist/esm/icons/shield-check.mjs';
import {__iconNode as store} from 'lucide-react/dist/esm/icons/store.mjs';
import {__iconNode as tag} from 'lucide-react/dist/esm/icons/tag.mjs';
import {__iconNode as trendingUp} from 'lucide-react/dist/esm/icons/trending-up.mjs';
import {__iconNode as user} from 'lucide-react/dist/esm/icons/user.mjs';
import {__iconNode as wallet} from 'lucide-react/dist/esm/icons/wallet.mjs';
const icons={arrowDown,arrowUp,arrowUpDown,briefcase,building,calendar,chart,coins,ellipsis,handCoins,heart,house,landmark,piggyBank,shield,store,tag,trendingUp,user,wallet};
export type CardIcon=keyof typeof icons;
const attribute=(value:string)=>value.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
const shapes=new Map<CardIcon,string>();
/** The icon's shapes on its 24-pixel grid, without the outer <svg>: strokes take the colour of the group around them. */
export function iconShapes(name:CardIcon):string{
 let shape=shapes.get(name);
 if(shape===undefined){
  shape=icons[name].map(([tag,attrs])=>`<${tag}${Object.entries(attrs).filter(([key])=>key!=='key').map(([key,value])=>` ${key}="${attribute(value)}"`).join('')}></${tag}>`).join('');
  shapes.set(name,shape);
 }
 return shape;
}
/** The icon of a built-in category or income kind, and of each place money went; an added category is a tag. */
const kindIcons:Record<string,CardIcon>={'Living expense':'house','Rent expense':'building','Charity':'heart','Other expense':'ellipsis',Salary:'briefcase','Rent income':'building','Business income':'store','Other income':'coins'};
export const kindIcon=(kind:string):CardIcon=>kindIcons[kind]??'tag';
