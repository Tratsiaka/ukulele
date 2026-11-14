// Стартовый набор песен: только общественное достояние (народные песни и авторы XVIII–XIX веков).
// Тексты и гармонизации записаны для этого приложения: лёгкие аккорды, «укулельные» тональности, по 2–4 куплета.
// Аккорды стоят перед ударным слогом. Музыкальная точность вторична: главное — играется и звучит приятно.

/**
 * @typedef {{id: string, title: string, artist: string, level: string, lang: 'ru'|'be'|'en', strum: string, text: string}} StarterSong
 * strum — id боя из STRUM_PATTERNS (core/curriculum.js); text — ChordPro.
 */

/** Шапка ChordPro + тело песни. */
function cp({ title, artist, key }, body) {
  return `{title: ${title}}\n{artist: ${artist}}\n{key: ${key}}\n\n${body.trim()}\n`;
}

/** @type {StarterSong[]} */
export const STARTER_SONGS = [
  {
    id: 'starter-bratec-yakov', title: 'Братец Яков', artist: 'народная', level: 'L0', lang: 'ru', strum: 'quarters',
    text: cp({ title: 'Братец Яков', artist: 'народная', key: 'C' }, `
{start_of_verse: Куплет 1}
[C]Братец Яков, [Am]братец Яков,
[C]спишь ли ты? [Am]Спишь ли ты?
[C]Колокол звонит, [Am]колокол звонит:
[C]бим-бам-бом, [Am]бим-бам-[C]бом.
{end_of_verse}

{start_of_verse: Куплет 2}
[C]Просыпайся, [Am]просыпайся,
[C]новый день, [Am]новый день!
[C]Солнышко встаёт, [Am]солнышко встаёт:
[C]динь-дин-дон, [Am]динь-дин-[C]дон.
{end_of_verse}
`),
  },
  {
    id: 'starter-row-boat', title: 'Row, Row, Row Your Boat', artist: 'trad.', level: 'L0', lang: 'en', strum: 'quarters',
    text: cp({ title: 'Row, Row, Row Your Boat', artist: 'trad.', key: 'C' }, `
{start_of_verse: Куплет 1}
[C]Row, row, row your boat
[Am]gently down the stream,
[C]merrily, merrily, [Am]merrily, merrily,
[C]life is [Am]but a [C]dream.
{end_of_verse}

{start_of_verse: Куплет 2}
[C]Row, row, row your boat
[Am]gently to the shore,
[C]merrily, merrily, [Am]merrily, merrily,
[C]let us [Am]row some [C]more.
{end_of_verse}
`),
  },
  {
    id: 'starter-oh-susanna', title: 'Oh! Susanna', artist: 'S. Foster', level: 'L1', lang: 'en', strum: 'du',
    text: cp({ title: 'Oh! Susanna', artist: 'S. Foster', key: 'C' }, `
{start_of_verse: Куплет 1}
I [C]come from Alabama with my [G]banjo on my knee,
I'm [C]going to Louisiana, my [G]true love for to [C]see.
It [C]rained all night the day I left, the [G]weather it was dry,
the [C]sun so hot I froze to death, Su[G]sanna, don't you [C]cry.
{end_of_verse}

{start_of_chorus: Припев}
Oh! [F]Susanna, oh [C]don't you cry for [G]me,
for I [C]come from Alabama with my [G]banjo on my [C]knee.
{end_of_chorus}

{start_of_verse: Куплет 2}
I [C]had a dream the other night, when [G]everything was still,
I [C]thought I saw Susanna dear a-[G]coming down the [C]hill.
The [C]buckwheat cake was in her mouth, the [G]tear was in her eye,
says [C]I, I'm coming from the south, Su[G]sanna, don't you [C]cry.
{end_of_verse}

{chorus: Припев}
`),
  },
  {
    id: 'starter-when-the-saints', title: 'When the Saints Go Marching In', artist: 'trad.', level: 'L1', lang: 'en', strum: 'du',
    text: cp({ title: 'When the Saints Go Marching In', artist: 'trad.', key: 'C' }, `
{start_of_verse: Куплет 1}
[C]Oh, when the saints go marching in,
oh, when the saints go marching [G]in,
oh Lord, I [C]want to be in that [F]number,
when the [C]saints go [G]marching [C]in.
{end_of_verse}

{start_of_verse: Куплет 2}
[C]Oh, when the sun begins to shine,
oh, when the sun begins to [G]shine,
oh Lord, I [C]want to be in that [F]number,
when the [C]sun be[G]gins to [C]shine.
{end_of_verse}

{start_of_verse: Куплет 3}
[C]Oh, when the band begins to play,
oh, when the band begins to [G]play,
oh Lord, I [C]want to be in that [F]number,
when the [C]band be[G]gins to [C]play.
{end_of_verse}
`),
  },
  {
    id: 'starter-vo-sadu', title: 'Во саду ли, в огороде', artist: 'Русская народная', level: 'L1', lang: 'ru', strum: 'du',
    text: cp({ title: 'Во саду ли, в огороде', artist: 'Русская народная', key: 'C' }, `
{start_of_verse: Куплет 1}
Во са[C]ду ли, в ого[F]роде
деви[G]ца гу[C]ляла,
она [C]ростом не[Am]величка,
лицом [G]круглолич[C]ка.
{end_of_verse}

{start_of_verse: Куплет 2}
За ней [C]ходит, за ней [F]бродит
уда[G]лой де[C]тина,
в руках [C]держит, в руках [Am]носит
пода[G]рочек доро[C]гой.
{end_of_verse}

{start_of_verse: Куплет 3}
Во пра[C]вой руке он [F]держит
перс[G]тень золо[C]той,
а во [C]левой руке [Am]носит
ка[G]мень доро[C]гой.
{end_of_verse}
`),
  },
  {
    id: 'starter-jingle-bells', title: 'Jingle Bells', artist: 'J. Pierpont', level: 'L1', lang: 'en', strum: 'du',
    text: cp({ title: 'Jingle Bells', artist: 'J. Pierpont', key: 'C' }, `
{start_of_verse: Куплет 1}
[C]Dashing through the snow in a one-horse open [F]sleigh,
o'er the fields we [G]go, laughing all the [C]way.
Bells on bobtail ring, making spirits [F]bright,
what fun it is to [G]ride and sing a sleighing song to[C]night!
{end_of_verse}

{start_of_chorus: Припев}
[C]Jingle bells, jingle bells, jingle all the way,
[F]oh, what fun it [C]is to ride in a one-horse open [G]sleigh, hey!
[C]Jingle bells, jingle bells, jingle all the way,
[F]oh, what fun it [C]is to ride in a [G]one-horse open [C]sleigh!
{end_of_chorus}

{start_of_verse: Куплет 2}
[C]A day or two ago I thought I'd take a [F]ride,
and soon Miss Fanny [G]Bright was seated by my [C]side.
The horse was lean and lank, misfortune seemed his [F]lot,
he got into a [G]drifted bank, and we, we got up[C]sot.
{end_of_verse}

{chorus: Припев}
`),
  },
  {
    id: 'starter-clementine', title: 'Clementine', artist: 'trad.', level: 'L1', lang: 'en', strum: 'waltz',
    text: cp({ title: 'Clementine', artist: 'trad.', key: 'C' }, `
{start_of_verse: Куплет 1}
In a [C]cavern, in a canyon,
excavating for a [G]mine,
dwelt a [C]miner, forty-[F]niner,
and his [G]daughter, Clemen[C]tine.
{end_of_verse}

{start_of_chorus: Припев}
Oh my [C]darling, oh my darling,
oh my darling, Clemen[G]tine,
you are [C]lost and gone for[F]ever,
dreadful [G]sorry, Clemen[C]tine.
{end_of_chorus}

{start_of_verse: Куплет 2}
Light she [C]was and like a fairy,
and her shoes were number [G]nine,
herring [C]boxes without [F]topses,
sandals [G]were for Clemen[C]tine.
{end_of_verse}

{chorus: Припев}

{start_of_verse: Куплет 3}
Drove she [C]ducklings to the water
every morning just at [G]nine,
hit her [C]foot against a [F]splinter,
fell in[G]to the foaming [C]brine.
{end_of_verse}

{start_of_verse: Куплет 4}
Ruby [C]lips above the water,
blowing bubbles soft and [G]fine,
but a[C]las, I was no [F]swimmer,
so I [G]lost my Clemen[C]tine.
{end_of_verse}

{chorus: Припев}
`),
  },
  {
    id: 'starter-amazing-grace', title: 'Amazing Grace', artist: 'J. Newton', level: 'L1', lang: 'en', strum: 'waltz',
    text: cp({ title: 'Amazing Grace', artist: 'J. Newton', key: 'C' }, `
{start_of_verse: Куплет 1}
A[C]mazing grace, how [F]sweet the [C]sound
that saved a wretch like [G]me.
I [C]once was lost, but [F]now am [C]found,
was [Am]blind, but [G]now I [C]see.
{end_of_verse}

{start_of_verse: Куплет 2}
'Twas [C]grace that taught my [F]heart to [C]fear,
and grace my fears re[G]lieved;
how [C]precious did that [F]grace ap[C]pear
the [Am]hour I [G]first be[C]lieved.
{end_of_verse}

{start_of_verse: Куплет 3}
Through [C]many dangers, [F]toils and [C]snares
I have already [G]come;
'tis [C]grace hath brought me [F]safe thus [C]far,
and [Am]grace will [G]lead me [C]home.
{end_of_verse}
`),
  },
  {
    id: 'starter-drunken-sailor', title: 'Drunken Sailor', artist: 'trad.', level: 'L2', lang: 'en', strum: 'island',
    text: cp({ title: 'Drunken Sailor', artist: 'trad.', key: 'Am' }, `
{start_of_verse: Куплет 1}
[Am]What shall we do with a drunken sailor?
[G]What shall we do with a drunken sailor?
[Am]What shall we do with a [Dm]drunken sailor
[G]early in the [Am]morning?
{end_of_verse}

{start_of_chorus: Припев}
[Am]Way hay, and up she rises,
[G]way hay, and up she rises,
[Am]way hay, and [Dm]up she rises
[G]early in the [Am]morning!
{end_of_chorus}

{start_of_verse: Куплет 2}
[Am]Put him in the longboat till he's sober,
[G]put him in the longboat till he's sober,
[Am]put him in the [Dm]longboat till he's sober
[G]early in the [Am]morning!
{end_of_verse}

{chorus: Припев}

{start_of_verse: Куплет 3}
[Am]Shave his belly with a rusty razor,
[G]shave his belly with a rusty razor,
[Am]shave his belly [Dm]with a rusty razor
[G]early in the [Am]morning!
{end_of_verse}

{chorus: Припев}
`),
  },
  {
    id: 'starter-scarborough-fair', title: 'Scarborough Fair', artist: 'trad.', level: 'L2', lang: 'en', strum: 'waltz',
    text: cp({ title: 'Scarborough Fair', artist: 'trad.', key: 'Am' }, `
{start_of_verse: Куплет 1}
[Am]Are you going to [G]Scarborough [Am]Fair?
[C]Parsley, [Am]sage, rose[C]mary [D]and [Am]thyme.
[Am]Remember me to [C]one who lives [G]there,
[Am]for once she [G]was a true [Em]love of [Am]mine.
{end_of_verse}

{start_of_verse: Куплет 2}
[Am]Tell her to make me a [G]cambric [Am]shirt,
[C]parsley, [Am]sage, rose[C]mary [D]and [Am]thyme,
[Am]without any seam or [C]needle[G]work,
[Am]and then she'll [G]be a true [Em]love of [Am]mine.
{end_of_verse}

{start_of_verse: Куплет 3}
[Am]Tell her to wash it in [G]yonder dry [Am]well,
[C]parsley, [Am]sage, rose[C]mary [D]and [Am]thyme,
[Am]where never spring water nor [C]rain ever [G]fell,
[Am]and then she'll [G]be a true [Em]love of [Am]mine.
{end_of_verse}

{start_of_verse: Куплет 4}
[Am]Tell her to dry it on [G]yonder [Am]thorn,
[C]parsley, [Am]sage, rose[C]mary [D]and [Am]thyme,
[Am]which never bore blossom since [C]Adam was [G]born,
[Am]and then she'll [G]be a true [Em]love of [Am]mine.
{end_of_verse}
`),
  },
  {
    id: 'starter-red-river-valley', title: 'Red River Valley', artist: 'trad.', level: 'L2', lang: 'en', strum: 'island',
    text: cp({ title: 'Red River Valley', artist: 'trad.', key: 'C' }, `
{start_of_verse: Куплет 1}
From this [C]valley they say you are going,
we will miss your bright eyes and sweet [G]smile,
for they [C]say you are taking the [F]sunshine
[Dm]that has [G]brightened our pathway a [C]while.
{end_of_verse}

{start_of_chorus: Припев}
Come and [C]sit by my side if you love me,
do not hasten to bid me a[G]dieu,
but re[C]member the Red River [F]Valley
[Dm]and the [G]one who has loved you so [C]true.
{end_of_chorus}

{start_of_verse: Куплет 2}
Won't you [C]think of the valley you're leaving,
oh how lonely, how sad it will [G]be,
oh, just [C]think of the fond heart you're [F]breaking
[Dm]and the [G]grief you are causing to [C]me.
{end_of_verse}

{chorus: Припев}
`),
  },
  {
    id: 'starter-shenandoah', title: 'Shenandoah', artist: 'trad.', level: 'L2', lang: 'en', strum: 'waltz',
    text: cp({ title: 'Shenandoah', artist: 'trad.', key: 'C' }, `
{start_of_verse: Куплет 1}
Oh [C]Shenandoah, I [F]long to [C]see you,
a[Am]way, you [F]rolling [C]river.
Oh [Dm]Shenandoah, I [G]long to [Em]see you,
a[Am]way, I'm [G]bound a[C]way, 'cross the [G]wide Mis[C]souri.
{end_of_verse}

{start_of_verse: Куплет 2}
Oh [C]Shenandoah, I [F]love your [C]daughter,
a[Am]way, you [F]rolling [C]river.
For [Dm]her I'd cross your [G]roaming [Em]waters,
a[Am]way, I'm [G]bound a[C]way, 'cross the [G]wide Mis[C]souri.
{end_of_verse}

{start_of_verse: Куплет 3}
'Tis [C]seven years since [F]last I've [C]seen you,
a[Am]way, you [F]rolling [C]river.
'Tis [Dm]seven years since [G]last I've [Em]seen you,
a[Am]way, we're [G]bound a[C]way, 'cross the [G]wide Mis[C]souri.
{end_of_verse}
`),
  },
  {
    id: 'starter-auld-lang-syne', title: 'Auld Lang Syne', artist: 'R. Burns', level: 'L2', lang: 'en', strum: 'island',
    text: cp({ title: 'Auld Lang Syne', artist: 'R. Burns', key: 'C' }, `
{start_of_verse: Куплет 1}
Should [C]auld acquaintance be for[G]got,
and [C]never brought to [F]mind?
Should [C]auld acquaintance be for[G]got,
and [Am]auld [Dm]lang [G]syne?
{end_of_verse}

{start_of_chorus: Припев}
For [C]auld lang syne, my [G]dear,
for [C]auld lang [F]syne,
we'll [C]tak a cup o' kindness [G]yet
for [F]auld [G]lang [C]syne.
{end_of_chorus}

{start_of_verse: Куплет 2}
We [C]twa hae run about the [G]braes
and [C]pou'd the gowans [F]fine;
but [C]we've wander'd mony a weary [G]fit
sin' [Am]auld [Dm]lang [G]syne.
{end_of_verse}

{chorus: Припев}

{start_of_verse: Куплет 3}
And [C]there's a hand, my trusty [G]fiere!
And [C]gie's a hand o' [F]thine!
And [C]we'll tak a right gude-willie [G]waught
for [Am]auld [Dm]lang [G]syne.
{end_of_verse}

{chorus: Припев}
`),
  },
  {
    id: 'starter-oy-moroz', title: 'Ой, мороз, мороз', artist: 'народная', level: 'L3', lang: 'ru', strum: 'waltz',
    text: cp({ title: 'Ой, мороз, мороз', artist: 'народная', key: 'Am' }, `
{start_of_verse: Куплет 1}
[Am]Ой, мороз, мороз,
[Dm]не морозь меня,
[G]не морозь ме[C]ня,
[E7]моего ко[Am]ня.
{end_of_verse}

{start_of_verse: Куплет 2}
[Am]Моего коня
[Dm]белогривого,
[G]у меня же[C]на,
[E7]ох, ревни[Am]вая.
{end_of_verse}

{start_of_verse: Куплет 3}
[Am]У меня жена,
[Dm]ох, красавица,
[G]ждёт меня до[C]мой,
[E7]ждёт, печа[Am]лится.
{end_of_verse}

{start_of_verse: Куплет 4}
[Am]Я приду домой
[Dm]на закате дня,
[G]обниму же[C]ну,
[E7]напою ко[Am]ня.
{end_of_verse}
`),
  },
  {
    id: 'starter-chernyi-voron', title: 'Чёрный ворон', artist: 'народная', level: 'L3', lang: 'ru', strum: 'shuffle',
    text: cp({ title: 'Чёрный ворон', artist: 'народная', key: 'Am' }, `
{start_of_verse: Куплет 1}
[Am]Чёрный ворон, [Dm]чёрный ворон,
[E7]что ты вьёшься надо [Am]мной?
[Am]Ты добычи [Dm]не дождёшься,
[E7]чёрный ворон, я не [Am]твой!
{end_of_verse}

{start_of_verse: Куплет 2}
[Am]Что ж ты когти [Dm]распускаешь
[E7]над моею голо[Am]вой?
[Am]Иль добычу [Dm]себе чаешь?
[E7]Чёрный ворон, я не [Am]твой!
{end_of_verse}

{start_of_verse: Куплет 3}
[Am]Завяжу смер[Dm]тельну рану
[E7]подарённым мне плат[Am]ком,
[Am]а потом с то[Dm]бой я стану
[E7]говорить всё об од[Am]ном.
{end_of_verse}
`),
  },
  {
    id: 'starter-korobeiniki', title: 'Коробейники', artist: 'Н. Некрасов, народная музыка', level: 'L3', lang: 'ru', strum: 'chuck',
    text: cp({ title: 'Коробейники', artist: 'Н. Некрасов, народная музыка', key: 'Am' }, `
{start_of_verse: Куплет 1}
[Am]Ой, полна, полна ко[E7]робушка,
[E7]есть и ситцы и пар[Am]ча.
[Dm]Пожалей, [G]моя за[C]знобушка,
[E7]молодецкого пле[Am]ча!
{end_of_verse}

{start_of_verse: Куплет 2}
[Am]Выйди, выйди в рожь вы[E7]сокую!
[E7]Там до ночки пого[Am]жу,
[Dm]а завижу [G]черно[C]окую —
[E7]все товары разло[Am]жу.
{end_of_verse}

{start_of_verse: Куплет 3}
[Am]Цены сам платил не[E7]малые,
[E7]не торгуйся, не ску[Am]пись:
[Dm]подставляй-ка [G]губы [C]алые,
[E7]ближе к милому са[Am]дись!
{end_of_verse}
`),
  },
  {
    id: 'starter-kalinka', title: 'Калинка', artist: 'И. Ларионов', level: 'L3', lang: 'ru', strum: 'eighths',
    text: cp({ title: 'Калинка', artist: 'И. Ларионов', key: 'Am' }, `
{start_of_chorus: Припев}
[C]Калинка, [G]калинка, калинка [C]моя!
В саду ягода [G]малинка, малинка [C]моя!
{end_of_chorus}

{start_of_verse: Куплет 1}
[Am]Ах, под сосною, под [E7]зелёною
[E7]спать положите вы [Am]меня.
[Am]Ай-люли, люли, [Dm]ай-люли, люли,
[E7]спать положите вы [Am]меня.
{end_of_verse}

{chorus: Припев}

{start_of_verse: Куплет 2}
[Am]Ах, сосенушка ты [E7]зелёная,
[E7]не шуми же надо [Am]мной!
[Am]Ай-люли, люли, [Dm]ай-люли, люли,
[E7]не шуми же надо [Am]мной!
{end_of_verse}

{chorus: Припев}

{start_of_verse: Куплет 3}
[Am]Ах, красавица, ду[E7]ша-девица,
[E7]полюби же ты [Am]меня!
[Am]Ай-люли, люли, [Dm]ай-люли, люли,
[E7]полюби же ты [Am]меня!
{end_of_verse}

{chorus: Припев}
`),
  },
  {
    id: 'starter-vo-pole-bereza', title: 'Во поле берёза стояла', artist: 'народная', level: 'L3', lang: 'ru', strum: 'shuffle',
    text: cp({ title: 'Во поле берёза стояла', artist: 'народная', key: 'Am' }, `
{start_of_verse: Куплет 1}
[Am]Во поле берёза [Dm]стояла,
[E7]во поле кудрявая [Am]стояла.
[Am]Люли, люли, [Dm]стояла,
[E7]люли, люли, [Am]стояла.
{end_of_verse}

{start_of_verse: Куплет 2}
[Am]Некому берёзу [Dm]заломати,
[E7]некому кудряву [Am]заломати.
[Am]Люли, люли, [Dm]заломати,
[E7]люли, люли, [Am]заломати.
{end_of_verse}

{start_of_verse: Куплет 3}
[Am]Я пойду, пойду [Dm]погуляю,
[E7]белую берёзу [Am]заломаю.
[Am]Люли, люли, [Dm]заломаю,
[E7]люли, люли, [Am]заломаю.
{end_of_verse}
`),
  },
  {
    id: 'starter-kupalinka', title: 'Купалінка', artist: 'беларуская народная', level: 'L3', lang: 'be', strum: 'du',
    text: cp({ title: 'Купалінка', artist: 'беларуская народная', key: 'Am' }, `
{start_of_verse: Куплет 1}
[Am]Купалінка, купалінка, [Dm]цёмная ночка,
[E7]цёмная ночка, а дзе ж твая [Am]дочка?
{end_of_verse}

{start_of_verse: Куплет 2}
[Am]Мая дочка ў садочку [Dm]ружу-кветку поліць,
[E7]ружу-кветку поліць, белы ручкі [Am]коліць.
{end_of_verse}

{start_of_verse: Куплет 3}
[Am]Кветачкі рвець, [Dm]вяночкі ўе,
[E7]вяночкі ўе, слёзкі [Am]льець.
{end_of_verse}
`),
  },
  {
    id: 'starter-house-rising-sun', title: 'House of the Rising Sun', artist: 'trad.', level: 'L3', lang: 'en', strum: 'waltz',
    text: cp({ title: 'House of the Rising Sun', artist: 'trad.', key: 'Am' }, `
{start_of_verse: Куплет 1}
There [Am]is a [C]house in [D]New Or[F]leans
they [Am]call the [C]Rising [E7]Sun,
it's [Am]been the [C]ruin of [D]many a poor [F]soul,
and [Am]me, oh [E7]Lord, for [Am]one.
{end_of_verse}

{start_of_verse: Куплет 2}
My [Am]mother [C]sewed my [D]travel [F]clothes,
my [Am]father [C]loved to [E7]roam,
he [Am]left one [C]night for [D]New Or[F]leans
and [Am]never [E7]came back [Am]home.
{end_of_verse}

{start_of_verse: Куплет 3}
Go [Am]tell my [C]baby [D]sister
to [Am]never [C]do as I've [E7]done,
to [Am]shun that [C]house in [D]New Or[F]leans
they [Am]call the [E7]Rising [Am]Sun.
{end_of_verse}
`),
  },
  {
    id: 'starter-greensleeves', title: 'Greensleeves', artist: 'trad.', level: 'L3', lang: 'en', strum: 'waltz',
    text: cp({ title: 'Greensleeves', artist: 'trad.', key: 'Am' }, `
{start_of_verse: Куплет 1}
A[Am]las, my [G]love, you [F]do me [E7]wrong
to [Am]cast me [G]off dis[F]courteous[E7]ly,
for [Am]I have [G]loved you [F]well and [E7]long,
de[Am]lighting [E7]in your [Am]company.
{end_of_verse}

{start_of_chorus: Припев}
[C]Greensleeves was [G]all my [Am]joy,
and [E7]Greensleeves was my de[Am]light,
[C]Greensleeves was my [G]heart of [Am]gold,
and [E7]who but my lady [Am]Greensleeves?
{end_of_chorus}

{start_of_verse: Куплет 2}
I [Am]have been [G]ready [F]at your [E7]hand
to [Am]grant what[G]ever [F]you would [E7]crave,
I [Am]have both [G]wagered [F]life and [E7]land,
your [Am]love and [E7]goodwill for to [Am]have.
{end_of_verse}

{chorus: Припев}
`),
  },
];

/** Песня стартового набора по id. */
export function starterSongById(id) {
  return STARTER_SONGS.find((s) => s.id === id) ?? null;
}
