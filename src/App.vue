<template>
  <div id="app">
    <!-- 未登录：显示登录页 -->
    <AuthView
        v-if="!isLoggedIn"
        @login-success="handleLoginSuccess"
    />

    <!-- 已登录：显示聊天页 -->
    <div v-else class="main-app">
      <!-- 用户信息栏 -->
      <div class="user-bar">
        <div class="user-info">
          <div class="user-avatar">
            {{ currentUser?.username?.charAt(0).toUpperCase() }}
          </div>
          <span class="user-name">{{ currentUser?.username }}</span>
        </div>
        <button class="logout-btn" @click="handleLogout">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
          </svg>
          退出
        </button>
      </div>

      <!-- 聊天组件 -->
      <ChatView :user="currentUser" :token="token" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import AuthView from './components/AuthView.vue';
import ChatView from './components/PYC.vue';

// ============ 状态 ============
const isLoggedIn = ref(false);
const currentUser = ref(null);
const token = ref('');

// ============ 方法 ============
function handleLoginSuccess(data) {
  token.value = data.access_token;
  currentUser.value = data.user;
  isLoggedIn.value = true;
}

function handleLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  token.value = '';
  currentUser.value = null;
  isLoggedIn.value = false;
}

// 检查本地存储的登录状态
function checkAuth() {
  const savedToken = localStorage.getItem('token');
  const savedUser = localStorage.getItem('user');

  if (savedToken && savedUser) {
    token.value = savedToken;
    currentUser.value = JSON.parse(savedUser);
    isLoggedIn.value = true;
  }
}

// ============ 生命周期 ============
onMounted(() => {
  checkAuth();

  Function.prototype.myCall = function (context, ...args) {
    context = context || globalThis

    const fn = Symbol()

    context[fn] = this

    const result = context[fn](...args)

    delete context[fn]

    return result
  }

  Function.prototype.myApply = function (context, args) {
    context = context || globalThis

    const fn = Symbol()

    context[fn] = this

    const result = context[fn](...(args || []))

    delete context[fn]

    return result
  }

  Function.prototype.myBind = function (context, ...args) {
    const self = this

    function bound(...newArgs) {
      if (this instanceof bound) {
        return new self(...args, ...newArgs)
      }

      return self.apply(context, [...args, ...newArgs])
    }

    bound.prototype = Object.create(self.prototype)

    return bound
  }
  function myNew(fn, ...args) {
    const obj = Object.create(fn.prototype)

    const result = fn.apply(obj, args)

    return result instanceof Object ? result : obj
  }

  function say() {
    console.log(this.name)
  }

  const person = { name: "张三" }

  say.myCall(person)
  say.myApply(person)
  say.myBind(person)

  function ASD(fn,delay){
    let tiema=null
    return function (...arg){
      clearTimeout(tiema)
      tiema=setTimeout(()=>{
        fn.apply(this, arg)
      },delay)
    }
  }
  function MyPromiseAll(promises){
    return new Promise((resolve, reject) => {
      let count = 0
      const results = []
      promises.forEach((p, index) => {
        Promise.resolve(p).then(val=>{
          results[ index]=val
          count++
          if(count===promises.length) resolve(results)
        }).catch(reject)

      })
    })
  }

  function deepClone(obj,map = new WeakMap()){
    if(obj===null||typeof obj!=='object')return obj //判断是否为null或者非引用类型
    if(map.has( obj))return map.get(obj)//map中是否已经有obj

    const clone=Array.isArray(obj)?[]:{}//判断这个对象是否为数组
    map.set(obj,clone)//不懂 是obj方法复制到clone中吗
    for(let key in obj){//递归obj属性
      if(obj.hasOwnProperty(key)){//不懂
        clone[key]=deepClone(obj[key])//obj属性的obj回调吧
      }
    }
    return clone//返回最终对象
  }

  //reactive
  const targetMap=new WeakMap()//存储目标对象到依赖映射的关系
  let activeEffect=null //存储当前正在执行的副作用函数
  function track(target,key){//依赖收集函数 target被代理的目标对象 key被代理的目标属性触发读取操作的属性名
    if(!activeEffect) return //如果没有活跃的副作用函数则返回
    let depsMap=targetMap.get(target)//获取当前对象对应的依赖映射关系 先尝试从targetMap获取该对象的依赖Map
    console.log("get",target,key,depsMap)
    if(!depsMap)targetMap.set(target,(depsMap=new Map()))//如果不存在则创建新的Map并设置
    let dep=depsMap.get(key)//获取当前属性对应的依赖集合
    console.log("get",dep)
    if(!dep) depsMap.set(key,(dep=new Set()))//如果不存在则创建新的Set并设置
    dep.add(activeEffect)//添加当前正在执行的副作用函数添加到依赖集合中
  }
  function trigger(target,key){//当对象属性值被修改时触发，通知相关依赖
    const depsMap=targetMap.get(target)//获取当前对象对应的依赖映射关系
    if(!depsMap) return
    const dep=depsMap.get(key)//获取属性对应的effect集合
    dep && dep.forEach(effectFn =>{
      if(effectFn.scheduler){
        effectFn.scheduler()
      }else{
        effectFn()
      }
    })//遍历集合并合并执行每个effect函数
  }
  function reactive(obj){//实现reactive
    return new Proxy(obj,{//Proxy代理对象
      get(target,key){//get 拦截
        track(target,key)//先调用track做依赖收集
        return target[key]//返回属性值
      },
      set(target,key,value){//set 拦截
        target[key]=value//设置目标属性新值
        trigger(target,key)//触发依赖 调用trigger触发相关副作用
        return true//返回true
      }
    })
  }
  function effect(fn, options = {}){//副作用函数注册器
    const effectFn=()=>{
      activeEffect=effectFn
      const result=fn()
      activeEffect=null
      return result
    }
    effectFn.scheduler=options.scheduler()
    if(!options.lazy){
      effectFn()
    }


    return effectFn
  }

  function computed(getter){
    let _value=null
    let dirty=true
    const effectFn = effect(getter, {
      lazy: true,
      scheduler() {
        dirty=true
      }
    })

    return {
      get value(){
        if(dirty){
          _value=effectFn()
          dirty=false
        }
        return _value
      }
    }

  }
  const state=reactive({count:0,name:'vue'})
  effect(()=>{
    //console.log("count is",state.count,"name is",state.name)
  })

  state.count = 1  // 触发
  state.name = 'react'  // 也触发
  const double = computed(() => state.count * 2)
  console.log(double.value)  // 2
  state.count = 2
  console.log(double.value)  // 4，自动更新 ✅
  console.log(double.value)  // getter 执行了一次
  console.log(double.value)  // getter 又执行了一次
  console.log(double.value)  // getter 又执行了一次

  //Promise本质是状态机+一个微任务调度器  分为三个状态pending fulfilled rejected
  //状态只能改变一次，.then()回调一定是进入微任务队列的
  Promise.resolve(1).then(res => {
    console.log(res);
  });
  //不会立即执行
  class MyPromise {
    constructor(executor) {
      this.status = 'pending';
      this.value = null;
      this.callbacks = [];


      const resolve=(value)=>{
        this.status = 'fulfilled';
        this.value = value;
        queueMicrotask(()=>{
          this.callbacks.forEach(cb=>cb( value));
        })
      }

      executor(resolve)
    }
    then(cb){
      this.callbacks.push(cb)
    }
  }

  //浏览器执行流程
  //加载html解析dom树 加载css 解析css树  合并为渲染树  遇到js会阻塞Dom解析
  //加载解析html 和 css是并行加载的
  //layout(布局) 将节点的几何信息转化为屏幕精确位置尺寸
  //Paint(重回) 将节点的几何信息转化成屏幕上的像素
  //composite(分层合成) 为了提高性能，浏览器会把页面分成很多层
  //最新的浏览器解析增加了预解析器 当 HTML 解析被 JS 阻塞时，浏览器不会干等。
  // 它会派出一个“侦察兵”往后看，发现后面有图片或 CSS，就先偷偷开启下载。
  // 这样等 JS 执行完，资源也下好了


  //渲染层执行不会触发layout,paint （布局，重绘）
  //它们有 transfrom  position:fixed opacity
  // will-change canvas video
  //丢帧卡顿吧 布局
  //web worker 处理繁重的计算工具 与主线程分开的责在高并发计算
  //service Worker 数据请求层的缓存工具
  //indexDB 浏览器缓存

  //复杂繁杂的动画任务交给canvas2/webGl
  //OffscreenCanvas 计算里面包含了webworker不用多开销了 可以直接计算渲染

  //service Worker 缓存数据
  // 注册：在主线程告诉浏览器“我要雇佣这个管家
  // 安装/缓存:在 Service Worker 脚本里，指定要把哪些图片（红包、背景）存进 Cache Storage。
  //拦截：当页面去请求图片时，管家会先看缓存里有没有，有就直接给，不去走网络。

  //requestAnimationFrame

  //解决webworker 计算时候如果还是需要繁重计算超过16.6ms 出现丢帧现象
  //用Delta Time（增量时间）如果如果红包每帧固定移动 5 像素，当发生卡顿时，红包看起来就会慢下来
  //更好的做法是： 根据两帧之间经过的实际时间来计算移动距离。
  //公式： $距离 = 速度 \times \Delta t$（Delta Time）
  //效果： 即使因为计算量大导致帧率从 60fps 掉到 30fps，红包虽然看起来没那么连贯
  // ，但它到达终点的时间是一致的，不会产生“慢动作”的感觉。
});
</script>

<style>
/* 全局样式 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

#app {
  min-height: 100vh;
}

.main-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* 用户信息栏 */
.user-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: #1f2937;
  color: #ffffff;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-avatar {
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
}

.user-name {
  font-size: 14px;
}

.logout-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  background: transparent;
  color: #ffffff;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.logout-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.logout-btn svg {
  width: 16px;
  height: 16px;
}

/* 调整 ChatView 高度 */
/*.main-app :deep(.app-container) {
  height: calc(100vh - 48px);
}*/
</style>