import { useEffect, useRef } from 'react'
import * as THREE from 'three'

// Plan units match the floor-plan editor's: rooms along both sides of a corridor.
const rooms = [[0, 0, 18, 22], [18, 0, 20, 22], [38, 0, 20, 22], [58, 0, 12, 22], [70, 0, 30, 22], [0, 32, 30, 22], [30, 32, 10, 22], [40, 32, 20, 22], [60, 32, 20, 22], [80, 32, 20, 22]]
const open = [[1, 4, 8], [0, 7, 9], [2, 8], [1, 2, 7]]
const FLOORS = 4, SCALE = 0.1, WALL = 0.95, GAP = 1.55

export default function HeroScene() {
  const host = useRef(null)
  useEffect(() => {
    const element = host.current
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    element.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
    camera.position.set(14, 11.5, 16.5)
    camera.lookAt(0, 2.2, 0)
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe9e5da, 1.6))
    const sun = new THREE.DirectionalLight(0xffffff, 1.8)
    sun.position.set(6, 14, 8)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9 })
    scene.add(sun)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.09 }))
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    const building = new THREE.Group()
    scene.add(building)
    const disposables = []
    const track = item => { disposables.push(item); return item }
    const slabMaterial = track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }))
    const wallMaterial = track(new THREE.MeshStandardMaterial({ color: 0xf3f1ec, roughness: 0.95, transparent: true, opacity: 0.55 }))
    const openMaterial = track(new THREE.MeshStandardMaterial({ color: 0x1e5b4f, roughness: 0.6, transparent: true, opacity: 0.82 }))
    const edgeMaterial = track(new THREE.LineBasicMaterial({ color: 0x121417, transparent: true, opacity: 0.5 }))
    const floors = []
    for (let level = 0; level < FLOORS; level++) {
      const floor = new THREE.Group()
      const slab = new THREE.Mesh(track(new THREE.BoxGeometry(10.4, 0.14, 5.8)), slabMaterial)
      slab.castShadow = slab.receiveShadow = true
      floor.add(slab)
      rooms.forEach(([x, y, w, h], index) => {
        const isOpen = open[level].includes(index)
        const geometry = track(new THREE.BoxGeometry(w * SCALE - 0.06, isOpen ? WALL : WALL * 0.92, h * SCALE - 0.06))
        const box = new THREE.Mesh(geometry, isOpen ? openMaterial : wallMaterial)
        box.position.set((x + w / 2) * SCALE - 5, 0.07 + geometry.parameters.height / 2, (y + h / 2) * SCALE - 2.7)
        box.castShadow = true
        const edges = new THREE.LineSegments(track(new THREE.EdgesGeometry(geometry)), edgeMaterial)
        edges.position.copy(box.position)
        floor.add(box, edges)
      })
      building.add(floor)
      floors.push(floor)
    }

    const resize = () => {
      const { clientWidth, clientHeight } = element
      renderer.setSize(clientWidth, clientHeight, false)
      camera.aspect = clientWidth / Math.max(clientHeight, 1)
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    resize()

    const pointer = { x: 0, y: 0 }
    const move = event => { const rect = element.getBoundingClientRect(); pointer.x = (event.clientX - rect.left) / rect.width - 0.5; pointer.y = (event.clientY - rect.top) / rect.height - 0.5 }
    element.addEventListener('pointermove', move)

    let frame = 0, visible = true
    const start = performance.now()
    const visibility = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible && !frame && !reduced) frame = requestAnimationFrame(tick) })
    visibility.observe(element)
    function place(time) {
      const t = (time - start) / 1000
      const spread = reduced ? 1 : 1 - Math.pow(1 - Math.min(t / 2.2, 1), 3)
      floors.forEach((floor, level) => { floor.position.y = level * (1.12 + (GAP - 1.12) * spread) })
      building.rotation.y = -0.5 + (reduced ? 0 : t * 0.06) + pointer.x * 0.25
      building.rotation.x = pointer.y * 0.05
      renderer.render(scene, camera)
    }
    function tick(time) { frame = 0; place(time); if (visible) frame = requestAnimationFrame(tick) }
    if (reduced) place(start)
    else frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      visibility.disconnect()
      element.removeEventListener('pointermove', move)
      disposables.forEach(item => item.dispose())
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])
  return <div ref={host} aria-hidden="true" className="absolute inset-0 [&>canvas]:h-full [&>canvas]:w-full" />
}
