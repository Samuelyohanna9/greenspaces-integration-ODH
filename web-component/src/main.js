import './UrbanGreenMapV2.js';

function autoInit() {
  customElements.whenDefined('r3gis-urbangreen-v2').then(() => {
    const containers = document.querySelectorAll('.urbangreen-map, .r3gis-urbangreen-v2, [data-urbangreen-map]');
    const ComponentClass = customElements.get('r3gis-urbangreen-v2');

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
