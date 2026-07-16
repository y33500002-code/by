/* Mock backend used only when /api/* is unreachable (standalone frontend testing). */
const Mock = (() => {
  const posters = [
    'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400',
    'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=400',
    'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=400',
    'https://images.unsplash.com/photo-1518676590629-3dcbd9c5a5c9?w=400',
    'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=400',
    'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400',
  ];
  const titles = ["Qorong'u Yo'l","Yulduzlar Orasida","Oxirgi Kun","Sokin Shahar","Botir Yurak","Yashirin Sir","Uzoq Manzil","Alanga","Kumush Oy","Tungi Poyga"];
  const genres = ['Aksiya','Drama','Komediya','Fantastika','Jangari','Romantik','Trierler','Tarixiy'];

  function movie(i){
    return {
      id: 'm' + i,
      title: titles[i % titles.length] + (i>=titles.length ? ' ' + (Math.floor(i/titles.length)+1) : ''),
      poster: posters[i % posters.length],
      previewVideo: null,
      description: 'Bosh qahramon o\'z oilasini qutqarish uchun xavfli sayohatga chiqadi. Yo\'lda u ko\'plab sinovlar va sirlarga duch keladi, ular uning butun hayotini o\'zgartirib yuboradi.',
      genre: genres[i % genres.length],
      country: 'O\'zbekiston',
      year: 2020 + (i % 6),
      duration: 90 + (i % 5) * 12,
      language: 'O\'zbek tili',
      quality: i % 3 === 0 ? '4K' : 'HD',
      views: 1200 + i * 137,
      likes: 80 + i * 11,
      rating: (7 + (i % 3) * 0.4).toFixed(1),
      liked: false,
      saved: false,
      isPremiumOnly: false,
      progress: i % 4 === 0 ? Math.floor(Math.random()*80)+5 : 0,
    };
  }
  const MOVIES = Array.from({length: 24}, (_,i)=>movie(i));

  const COMMENTS = {};
  function seedComments(id){
    if (COMMENTS[id]) return COMMENTS[id];
    COMMENTS[id] = Array.from({length:5},(_,i)=>({
      id: id+'-c'+i,
      user: { id: 'u'+i, name: ['Steam','Anvar','Malika','Diyor','Kamola'][i], premium: i===0 },
      text: ['Zo\'r kino ekan!','Oxiri kutilmagan bo\'ldi','Yana koraman','Rejissyor ishlagan','Chin haqiqiy hayot voqeasi'][i],
      likes: i*3,
      liked:false,
      time: '2 soat oldin',
      replies: []
    }));
    return COMMENTS[id];
  }

  const ME = {
    id: 'me', name: 'Azizbek', username: '@azizbek', avatar: null,
    premium: true, premiumColor: '#8B5CF6', frame: 'violet', isAdmin: true,
    followers: 128, following: 74, level: 'Gold', levelProgress: 62, coins: 340,
    savedMovies: 6, likedMovies: 14, watchHistory: 31,
  };

  function paginate(list, cursor, size=6){
    const start = Number(cursor)||0;
    return { items: list.slice(start, start+size), nextCursor: start+size < list.length ? start+size : null };
  }

  return {
    handle(path, opts){
      const method = opts.method || 'GET';
      const [route, qs] = path.split('?');
      const params = new URLSearchParams(qs || '');

      if (route === '/movies/home') {
        return {
          hero: MOVIES[0],
          trending: MOVIES.slice(0,8),
          newMovies: MOVIES.slice(8,16),
          continueWatching: MOVIES.filter(m=>m.progress>0),
          popular: [...MOVIES].sort((a,b)=>b.views-a.views).slice(0,8),
          recommended: MOVIES.slice(4,12),
          genres,
        };
      }
      if (route === '/movies/genres') return genres;
      if (route.startsWith('/movies/') && route.endsWith('/comments') && method === 'GET') {
        const id = route.split('/')[2];
        return seedComments(id);
      }
      if (route.startsWith('/movies/') && route.endsWith('/comments') && method === 'POST') {
        const id = route.split('/')[2];
        const body = JSON.parse(opts.body || '{}');
        const list = seedComments(id);
        const c = { id: id+'-c'+list.length, user:{id:'me',name:ME.name,premium:ME.premium}, text: body.text, likes:0, liked:false, time:'hozir', replies:[] };
        list.unshift(c);
        return c;
      }
      if (route.match(/^\/movies\/[^/]+\/like$/)) return { liked:true, likes: 100 };
      if (route.match(/^\/movies\/[^/]+\/save$/)) return { saved:true };
      if (route.match(/^\/movies\/[^/]+\/watch$/)) return { ok:true };
      if (route.match(/^\/movies\/[^/]+\/comments\/[^/]+\/like$/)) return { liked:true };
      if (route.startsWith('/movies/') && !route.includes('comments')) {
        const id = route.split('/')[2];
        const idx = parseInt(id.replace('m',''))||0;
        return MOVIES[idx % MOVIES.length];
      }
      if (route === '/movies') {
        const genre = params.get('genre');
        return MOVIES.filter(m=>!genre || m.genre===genre);
      }
      if (route === '/reels') {
        return paginate(MOVIES.map(m=>({...m, reelViews:m.views, friendActivity: Math.random()>0.6 ? {name:'Steam', action: Math.random()>0.5?'liked':'commented'} : null})), params.get('cursor'), 5);
      }
      if (route === '/search') {
        const q = (params.get('q')||'').toLowerCase();
        const type = params.get('type');
        const movies = MOVIES.filter(m=>m.title.toLowerCase().includes(q));
        const users = q ? [{id:'u1',name:'Anvar Karimov',username:'@anvar',premium:true},{id:'u2',name:'Malika Yusupova',username:'@malika',premium:false}] : [];
        if (type==='movies') return { movies, users: [] };
        if (type==='users') return { movies: [], users };
        return { movies, users };
      }
      if (route === '/users/me') return ME;
      if (route.startsWith('/users/')) return { ...ME, id: route.split('/')[2], name:'Anvar Karimov', username:'@anvar', premium:true };
      if (route === '/notifications') return [
        { id:1, type:'follow', text:'Malika sizga follow qildi', time:'5 daqiqa oldin', read:false },
        { id:2, type:'like', text:'Diyor sizning izohingizni like qildi', time:'1 soat oldin', read:false },
        { id:3, type:'gift', text:'Anvar sizga Premium sovg\'a qildi 🎁', time:'kecha', read:true },
      ];
      if (route === '/premium/plans') return [
        { id:'p1', name:'1 oy', price: 4900, coins: 490, stars: 250 },
        { id:'p2', name:'3 oy', price: 12900, coins: 1290, stars: 650, badge:'Mashhur' },
        { id:'p3', name:'12 oy', price: 39900, coins: 3990, stars: 1990 },
      ];
      if (route === '/admin/movies') return MOVIES;
      if (route === '/admin/stats') return { totalMovies: MOVIES.length, totalUsers: 2481, totalViews: 184920, premiumUsers: 312 };
      if (route === '/admin/users') {
        const q = (params.get('q')||'').toLowerCase();
        const names = ['Anvar Karimov','Malika Yusupova','Diyor Toshev','Kamola Rashidova','Bekzod Aliyev'];
        let users = names.map((name,i)=>({
          id: 'u'+i, name, username: '@'+name.split(' ')[0].toLowerCase(), joinedAt: '2026-0'+((i%6)+1)+'-12',
          coins: 100+i*37, premium: i%2===0, premiumPlan: i%2===0 ? '3 oy' : null, premiumDaysLeft: i%2===0 ? 45-i : null,
          isOwner: i===0, isAdmin: i===0, isSupport: i<=1,
        }));
        if (q) users = users.filter(u => u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q));
        return users;
      }
      if (route === '/admin/premium/pending') return [
        { userId:'u2', name:'Diyor Toshev', username:'@diyor', plan:'6m', planName:'6 oy', price:45000, requestedAt: new Date().toISOString() },
        { userId:'u3', name:'Kamola Rashidova', username:'@kamola', plan:'1m', planName:'1 oy', price:10000, requestedAt: new Date().toISOString() },
      ];
      if (route === '/admin/settings') return {
        channels: [{ username:'kinokanal', title:"Kino kanali" }],
        premiumPrices: { '1m':10000, '3m':25000, '6m':45000, '1y':80000 },
        premiumDiscount: { '3m':0, '6m':10, '1y':15 },
        premiumBonusCoin: 50, referralPremiumBonus: 30, paymentCard: '8600 1234 5678 9012',
        coinSettings: { daily:3, referral:10, comment:2 },
      };
      if (method === 'POST' || method === 'PUT') return { ok:true, id: 'new'+Date.now() };
      if (method === 'DELETE') return { ok:true };
      return {};
    }
  };
})();
