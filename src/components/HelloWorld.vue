<script setup>
defineProps({
  msg: {
    type: String,
    required: true,
  },
})
//防抖
function dene(fn, time){
  let tiems;//设置时间
  return function (...arg){
    if(tiems) clearTimeout(tiems);//清除之前定时器
    tiems = setTimeout(()=>{ //设置定时器
      fn.apply(this, arg)
    },time)
  }
}
function daes(fn,times=1000){
  let tiema;
  return function (...arg){
    if(tiema) clearTimeout(tiema);
    tiema=setTimeout(()=>{
      fn.apply(this, arg)
    },times)
  }
}
//节流
function throttle(fn, time=1000){
  let tiems=0;
  return function (...arg){
    let now = Date.now();
    if(now - tiems > time){
      fn.apply(this, arg)
      tiems = now;
    }
  }

}
function thro(fn,time=1000){
  let tmi=0;
  return function(...args){
    let now=Date.now();
    if(now-tmi>time){
      fn.apply(this, args)
      tmi=now;
    }
  }
}

</script>

<template>
  <div class="greetings">
    <h1 class="green">{{ msg }}</h1>
    <h3>
      You’ve successfully created a project with
      <a href="https://vite.dev/" target="_blank" rel="noopener">Vite</a> +
      <a href="https://vuejs.org/" target="_blank" rel="noopener">Vue 3</a>.
    </h3>
  </div>
</template>

<style scoped>
h1 {
  font-weight: 500;
  font-size: 2.6rem;
  position: relative;
  top: -10px;
}

h3 {
  font-size: 1.2rem;
}

.greetings h1,
.greetings h3 {
  text-align: center;
}

@media (min-width: 1024px) {
  .greetings h1,
  .greetings h3 {
    text-align: left;
  }
}
</style>
