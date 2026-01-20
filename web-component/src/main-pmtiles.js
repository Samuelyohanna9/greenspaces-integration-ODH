import './UrbanGreenMapPMTiles.js';

function autoInit() {
  customElements.whenDefined('urbangreen-map-pmtiles').then(() => {
    const containers = document.querySelectorAll('.urbangreen-map-pmtiles, [data-urbangreen-pmtiles]');
    const ComponentClass = customElements.get('urbangreen-map-pmtiles');

    containers.forEach(container => {
      if (!container.hasAttribute('data-initialized')) {
        const component = new ComponentClass();

        component.style.width = '100%';
        component.style.height = '100%';
        component.style.display = 'block';

        const dataAttributes = [];
        Array.from(container.attributes).forEach(attr => {
          if (attr.name.startsWith('data-') && attr.name !== 'data-initialized') {
            dataAttributes.push({ name: attr.name.replace('data-', ''), value: attr.value });
          }
        });

        container.innerHTML = '';
        container.appendChild(component);

        setTimeout(() => {
          dataAttributes.forEach(attr => {
            component.setAttribute(attr.name, attr.value);
          });
        }, 0);

        container.setAttribute('data-initialized', 'true');
      }
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoInit);
} else {
  autoInit();
}

export { default as UrbanGreenMapPMTiles } from './UrbanGreenMapPMTiles.js';