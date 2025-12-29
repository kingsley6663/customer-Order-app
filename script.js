// Simple price catalog
const CATALOG = {
  'shinefeel t-roll': 133,
  'kiki t-roll': 133,
  'praise t-roll': 127,
  'aquasoft t-roll': 127,
  'delords t-roll': 0,
  'mamycare t-roll': 0,
  'bobo t-roll': 0,
  'akor t-roll': 0,
  'cozzy t-roll': 0,
  'passion t-roll': 0,
  'vicky t-roll': 236,
  'vicky unwrapped': 170,
  'wippy t-roll': 152,
  'zigi t-roll': 0,
  'amyno baby diaper': 0,
  'blimey baby diaper': 0,
  'delords baby diaper': 0,
  'jk baby diaper': 0,
  'mamycare baby diaper': 0,
  'wippy towel big': 0,
  'wippy towel small': 0,
  'oboshie kitchen towel': 0,
  'wippy napkins': 65,
  'wippy facial tissue': 165,
  'angel cloud napkins': 0,
  'angel cloud pocket tissue': 0
};

// User Management - Loaded from local storage
let appUsers = JSON.parse(localStorage.getItem('whatsapp_users') || '[]');
if (appUsers.length === 0) {
  appUsers = [{ name: 'Admin', pin: '1234', role: 'manager' }];
  localStorage.setItem('whatsapp_users', JSON.stringify(appUsers));
}

// PowerBI Streaming Dataset URL
// Create via: PowerBI Service > Create > Streaming dataset > API
const POWERBI_API_URL = ''; 

// Orders storage
let orders = JSON.parse(localStorage.getItem('whatsapp_orders') || '[]');
let deletedOrders = JSON.parse(localStorage.getItem('whatsapp_deleted_orders') || '[]');
let orderIdCounter = orders.length > 0 ? Math.max(...orders.map(o => parseInt(o.id.replace('ORD-', '')))) + 1 : 1001;

// Cached DOM elements for performance
const DOM = {
  chatMessages: null,
  messageInput: null,
  searchInput: null,
  ordersList: null,
  pendingCount: null,
  confirmedCount: null,
  deliveredCount: null,
  creditTotal: null,
  productSelect: null,
  quantityInput: null,
  customerInput: null,
  liveTotal: null,
  paymentMethod: null,
  paymentFilter: null
};

// Debounce utility for performance
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function parseItemsString(itemsStr) {
  const items = [];
  if (itemsStr) {
    const lines = itemsStr.split(/\n+/);
    for (const line of lines) {
      // Try new format: Name - Qty - Price - Total
      const newMatch = line.trim().match(/^(.+)\s*-\s*(\d+)\s*-\s*([\d.]+)\s*-\s*([\d.]+)/);
      if (newMatch) {
        const name = newMatch[1].trim();
        const qty = parseInt(newMatch[2]);
        const unitPrice = parseFloat(newMatch[3]);
        items.push({ name: capitalize(name), qty, price: unitPrice * qty });
        continue;
      }

      // Fallback to old format: 2x Name (handle comma separated)
      const parts = line.split(',');
      for (const part of parts) {
        const match = part.trim().match(/(\d+)x (.+)/);
        if (match) {
          const qty = parseInt(match[1]);
          let name = match[2].trim();

          // Find full product name from catalog
          const catalogName = Object.keys(CATALOG).find(k => k.includes(name.toLowerCase()));
          if (catalogName) name = catalogName;

          const price = CATALOG[name.toLowerCase()] || 25000;
          items.push({ name: capitalize(name), qty, price: price * qty });
        }
      }
    }
  }
  return items;
}

    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
      checkAuth();
      cleanupDeletedOrders();
      // Cache DOM elements
      DOM.chatMessages = document.getElementById('chatMessages');
      DOM.messageInput = document.getElementById('messageInput');
      DOM.searchInput = document.getElementById('searchInput');
      DOM.ordersList = document.getElementById('ordersList');
      DOM.pendingCount = document.getElementById('pendingCount');
      DOM.confirmedCount = document.getElementById('confirmedCount');
      DOM.deliveredCount = document.getElementById('deliveredCount');
      DOM.creditTotal = document.getElementById('creditTotal');
      DOM.productSelect = document.getElementById('productSelect');
      DOM.quantityInput = document.getElementById('quantityInput');
      DOM.customerInput = document.getElementById('customerInput');
      DOM.liveTotal = document.getElementById('liveTotal');
      DOM.paymentMethod = document.getElementById('paymentMethod');
      DOM.paymentFilter = document.getElementById('paymentFilter');

      renderOrders();
      updateStats();
      populateProductSelect();

      // Live total calculation listeners
      DOM.productSelect.addEventListener('change', updateLiveTotal);
      DOM.quantityInput.addEventListener('input', updateLiveTotal);
      DOM.messageInput.addEventListener('input', updateLiveTotal);

      // Payment filter listener
      DOM.paymentFilter.addEventListener('change', () => {
        renderOrders(DOM.searchInput.value);
      });

      // Enter key to send
      DOM.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });

      // Debounced search functionality
      const debouncedRender = debounce((value) => renderOrders(value), 300);
      DOM.searchInput.addEventListener('input', (e) => {
        debouncedRender(e.target.value);
      });

      // Theme switcher
      const themeToggle = document.getElementById('theme-toggle');
      const savedTheme = localStorage.getItem('theme');

      // Default to dark mode if no theme is saved
      if (savedTheme === 'light') {
        document.body.classList.remove('dark-mode');
        themeToggle.checked = true;
      } else {
        document.body.classList.add('dark-mode');
        themeToggle.checked = false;
      }

      themeToggle.addEventListener('change', () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', themeToggle.checked ? 'light' : 'dark');
      });

      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('customProductDropdown');
        if (dropdown && !dropdown.contains(e.target)) {
          document.getElementById('dropdownMenu').classList.remove('show');
        }
      });
    });

function updateLiveTotal() {
  const product = DOM.productSelect.value;
  const qty = parseInt(DOM.quantityInput.value) || 0;
  const price = CATALOG[product.toLowerCase()] || 0;
  const currentSelectionTotal = price * qty;

  let messageTotal = 0;
  const message = DOM.messageInput.value;
  if (message) {
    const lines = message.split(/\n+/);
    for (const line of lines) {
      // Try new format: Name - Qty - Price - Total
      const newMatch = line.trim().match(/^(.+)\s*-\s*(\d+)\s*-\s*([\d.]+)\s*-\s*([\d.]+)/);
      if (newMatch) {
        messageTotal += parseFloat(newMatch[4]);
        continue;
      }
      // Try old format: 2x Name
      const oldMatch = line.trim().match(/^(\d+)x\s+(.+)/);
      if (oldMatch) {
        const q = parseInt(oldMatch[1]);
        let n = oldMatch[2].trim().split(' - ')[0];
        const catName = Object.keys(CATALOG).find(k => k.includes(n.toLowerCase()));
        if (catName) n = catName;
        const p = CATALOG[n.toLowerCase()] || 0;
        messageTotal += p * q;
      }
    }
  }

  const grandTotal = currentSelectionTotal + messageTotal;

  if (DOM.liveTotal) {
    DOM.liveTotal.textContent = `GH₵ ${grandTotal.toLocaleString()}`;
  }
}

function sendMessage() {
  const input = document.getElementById('messageInput');
  const message = input.value.trim();
  if (!message) return;

  input.value = '';

  // Process order first
  const result = parseOrder(message);
  if (result.success) {
    const order = createOrder(result.data);
    // Add formatted incoming message with product names
    addChatMessage(`📝 Order Sent:\n${result.data.items.map(i => `• ${i.qty}x ${i.name}`).join('\n')}\nCustomer: ${result.data.phone}`, 'incoming');
    setTimeout(() => {
      addChatMessage(
        `✅ Order Received!\n\n` +
        `Order ID: ${order.id}\n` +
        `Items:\n${order.items.map(i => `• ${i.qty}x ${i.name} - GH₵ ${i.price.toLocaleString()}`).join('\n')}\n\n` +
        `Total: GH₵ ${order.total.toLocaleString()}\n\n` +
        `Payment: ${order.paymentMethod}\n` +
        `Reply "YES ${order.id}" to confirm.`,
        'outgoing'
      );
    }, 500);
  } else if (message.toUpperCase().startsWith('YES ORD-')) {
    const orderId = message.toUpperCase().replace('YES ', '');
    addChatMessage(message, 'incoming');
    setTimeout(() => {
      confirmOrder(orderId);
    }, 500);
  } else {
    addChatMessage(message, 'incoming');
    setTimeout(() => {
      addChatMessage(
        `❌ Could not parse order.\n\n` +
        `Please use format:\n` +
        `ORDER\nProduct - Qty - Price - Total\nCustomer Name\n\n` +
        `Example:\n` +
        `ORDER\nPizza - 2 - 25 - 50\nKingsley`,
        'outgoing'
      );
    }, 500);
  }
}

function addChatMessage(text, type) {
  const container = document.getElementById('chatMessages');
  const msg = document.createElement('div');
  msg.className = `message ${type}`;
  msg.innerHTML = `
    <div>${text.replace(/\n/g, '<br>')}</div>
    <div class="time">${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
  `;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function parseOrder(message) {
  const upper = message.toUpperCase();
  if (!upper.startsWith('ORDER')) {
    return { success: false };
  }

  // Split into lines
  const lines = message.split(/\n+/).map(l => l.trim()).filter(l => l);
  
  // Remove "ORDER" line
  if (lines[0].toUpperCase().startsWith('ORDER')) {
    if (lines[0].length > 5) {
       // "ORDER Item..." on same line
       lines[0] = lines[0].substring(5).trim();
       if (!lines[0]) lines.shift();
    } else {
       lines.shift();
    }
  }

  const items = [];
  const metadata = [];

  for (const line of lines) {
    // Try new format: Name - Qty - Price - Total
    const newMatch = line.match(/^(.+)\s*-\s*(\d+)\s*-\s*([\d.]+)\s*-\s*([\d.]+)/);
    if (newMatch) {
      const name = newMatch[1].trim();
      const qty = parseInt(newMatch[2]);
      const unitPrice = parseFloat(newMatch[3]);
      items.push({ name: capitalize(name), qty, price: unitPrice * qty });
      continue;
    }
    
    // Try old format: 2x Name
    const oldMatch = line.match(/^(\d+)x\s+(.+)/);
    if (oldMatch) {
       const qty = parseInt(oldMatch[1]);
       let name = oldMatch[2].trim();
       // Clean up potential trailing price/dash if mixed
       name = name.split(' - ')[0]; 
       
       const catalogName = Object.keys(CATALOG).find(k => k.includes(name.toLowerCase()));
       if (catalogName) name = catalogName;
       const price = CATALOG[name.toLowerCase()] || 0;
       items.push({ name: capitalize(name), qty, price: price * qty });
       continue;
    }

    metadata.push(line);
  }

  if (items.length === 0) {
    return { success: false };
  }

  let status = 'pending';
  let phone = 'Unknown';
  let paymentMethod = 'Cash';

  if (metadata.length > 0) {
    const last = metadata[metadata.length - 1].toLowerCase();
    if (['pending', 'confirmed', 'delivered'].includes(last)) {
      status = last;
      metadata.pop();
    }
    
    const paymentIndex = metadata.findIndex(l => l.toLowerCase().startsWith('payment:'));
    if (paymentIndex > -1) {
      paymentMethod = metadata[paymentIndex].substring(8).trim();
      metadata.splice(paymentIndex, 1);
    }

    if (metadata.length > 0) {
      phone = metadata.join(', ');
    }
  }

  return {
    success: true,
    data: { items, phone, status, paymentMethod }
  };
}

function createOrder(data) {
  const order = {
    id: `ORD-${orderIdCounter++}`,
    timestamp: new Date().toISOString(),
    phone: data.phone,
    items: data.items, // Store as array
    total: data.items.reduce((sum, i) => sum + i.price, 0),
    status: data.status || 'pending',
    paymentMethod: data.paymentMethod || 'Cash',
    notes: '',
    salesRep: sessionStorage.getItem('whatsapp_user') || 'System',
    history: [{
      action: 'created',
      timestamp: new Date().toISOString(),
      details: `Order created with status: ${data.status || 'pending'}`
    }]
  };

  orders.unshift(order);
  saveOrders();
  renderOrders();
  updateStats();
  pushToPowerBI(order);
  return order;
}

function confirmOrder(orderId) {
  const order = orders.find(o => o.id === orderId);
  if (order && order.status === 'pending') {
    order.status = 'confirmed';
    saveOrders();
    renderOrders();
    updateStats();
    pushToPowerBI(order);
    addChatMessage(`✅ Order ${orderId} has been confirmed!\n\nThank you for your order. We'll prepare it right away.`, 'outgoing');
  }
}

function updateOrderStatus(orderId, newStatus) {
  const order = orders.find(o => o.id === orderId);
  if (order) {
    const oldStatus = order.status;
    order.status = newStatus;
    order.history.push({
      action: 'status_changed',
      timestamp: new Date().toISOString(),
      details: `Status changed from ${capitalize(oldStatus)} to ${capitalize(newStatus)}`
    });
    saveOrders();
    renderOrders();
    updateStats();
    pushToPowerBI(order);
  }
}

function deleteOrder(orderId) {
  if (confirm('Move this order to Recycle Bin?')) {
    const index = orders.findIndex(o => o.id === orderId);
    if (index !== -1) {
      const order = orders[index];
      order.deletedTimestamp = new Date().toISOString();
      deletedOrders.push(order);
      localStorage.setItem('whatsapp_deleted_orders', JSON.stringify(deletedOrders));
      orders.splice(index, 1);
      saveOrders();
      renderOrders();
      updateStats();
      showToast('Order moved to Recycle Bin ♻️');
    }
  }
}

function renderOrders(searchTerm = '') {
  const container = document.getElementById('ordersList');
  const lowerCaseSearchTerm = searchTerm.toLowerCase();
  const currentUser = sessionStorage.getItem('whatsapp_user');
  const currentRole = sessionStorage.getItem('whatsapp_role');
  const paymentFilter = DOM.paymentFilter ? DOM.paymentFilter.value : 'all';

  const filteredOrders = orders.filter(order => {
    if (currentRole !== 'manager' && order.salesRep !== currentUser) {
      return false;
    }

    const payment = order.paymentMethod || 'Cash';
    if (paymentFilter === 'Credit' && payment !== 'Credit') return false;
    if (paymentFilter === 'Paid' && payment === 'Credit') return false;

    if (!lowerCaseSearchTerm) return true;

    const searchInId = order.id.toLowerCase().includes(lowerCaseSearchTerm);
    const searchInPhone = order.phone.toLowerCase().includes(lowerCaseSearchTerm);
    const searchInItems = order.items.some(item =>
      item.name.toLowerCase().includes(lowerCaseSearchTerm)
    );

    return searchInId || searchInPhone || searchInItems;
  });

  if (orders.length === 0) { // Show initial empty state if no orders ever
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
        </svg>
        <p>No orders yet</p>
        <p>Send a message to create an order</p>
      </div>
    `;
    return;
  }

  if (filteredOrders.length === 0) { // Show empty state for no search results
    container.innerHTML = `
      <div class="empty-state">
        <p>No orders found for "${searchTerm}"</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filteredOrders.map(order => `
    <div class="order-card">
      <div class="order-header">
        <div>
          <div class="order-id">${order.id}</div>
          <div class="order-time">${new Date(order.timestamp).toLocaleString()}</div>
        </div>
        <span class="order-status ${order.status}">${capitalize(order.status)}</span>
      </div>
      <div class="order-customer"><a href="#" onclick="showCustomerHistory(\'${order.phone}\')" style="color: inherit; text-decoration: underline;">📱 ${order.phone}</a></div>
      <div class="order-payment" style="font-size: 0.9em; color: #555;">
        💳 ${order.paymentMethod || 'Cash'}
        ${order.paymentMethod === 'Credit' ? '<span style="display: inline-block; width: 10px; height: 10px; background-color: #ef5350; border-radius: 50%; margin-left: 6px; vertical-align: middle;" title="Credit Order"></span>' : ''}
      </div>
      <div class="order-rep" style="font-size: 0.8em; color: #666; margin-bottom: 8px;">👤 Entered by: ${order.salesRep || 'Unknown'}</div>
      ${order.notes ? `<div class="order-notes">${order.notes}</div>` : ''}
      <div class="order-items">
        ${order.items.map(i => `
          <div class="order-item">
            <span>${i.qty}x ${i.name}${i.color && i.collection ? ` (${i.color}, ${i.collection})` : ''}</span>
            <span>GH₵ ${i.price.toLocaleString()}</span>
          </div>
        `).join('')}
      </div>
      <div class="order-total">
        <span>Total</span>
        <span>GH₵ ${order.total.toLocaleString()}</span>
      </div>
      <div class="order-actions">
        <button class="btn btn-edit" onclick="editOrder('${order.id}')" title="Edit Order">✏️ Edit</button>
        ${order.status === 'pending' ? `<button class="btn btn-confirm" onclick="updateOrderStatus('${order.id}', 'confirmed')" title="Confirm Order">✓ Confirm</button>` : ''}
        ${order.status === 'confirmed' ? `<button class="btn btn-deliver" onclick="updateOrderStatus('${order.id}', 'delivered')" title="Mark Order as Delivered">🚚 Mark Delivered</button>` : ''}
        <button class="btn btn-delete" onclick="deleteOrder('${order.id}')" title="Delete Order">🗑 Delete</button>
      </div>
    </div>
  `).join('');
}

function updateStats() {
  const currentUser = sessionStorage.getItem('whatsapp_user');
  const currentRole = sessionStorage.getItem('whatsapp_role');

  const visibleOrders = orders.filter(o => currentRole === 'manager' || o.salesRep === currentUser);

  DOM.pendingCount.textContent = visibleOrders.filter(o => o.status === 'pending').length;
  DOM.confirmedCount.textContent = visibleOrders.filter(o => o.status === 'confirmed').length;
  DOM.deliveredCount.textContent = visibleOrders.filter(o => o.status === 'delivered').length;

  const totalCredit = visibleOrders
    .filter(o => o.paymentMethod === 'Credit')
    .reduce((sum, o) => sum + o.total, 0);

  if (DOM.creditTotal) DOM.creditTotal.textContent = `GH₵ ${totalCredit.toLocaleString()}`;
}

function saveOrders() {
  localStorage.setItem('whatsapp_orders', JSON.stringify(orders));
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function populateProductSelect() {
  const container = document.getElementById('dropdownOptions');
  container.innerHTML = '';

  Object.keys(CATALOG).forEach(key => {
    const div = document.createElement('div');
    div.className = 'dropdown-option';
    div.textContent = capitalize(key);
    div.onclick = () => selectProduct(key);
    container.appendChild(div);
  });
}

window.toggleDropdown = function() {
  const menu = document.getElementById('dropdownMenu');
  menu.classList.toggle('show');
  if (menu.classList.contains('show')) {
    document.getElementById('dropdownSearch').focus();
  }
};

window.filterProducts = function() {
  const search = document.getElementById('dropdownSearch').value.toLowerCase();
  const options = document.querySelectorAll('.dropdown-option');
  options.forEach(opt => {
    const text = opt.textContent.toLowerCase();
    opt.style.display = text.includes(search) ? 'block' : 'none';
  });
};

window.selectProduct = function(key) {
  document.getElementById('dropdownSelected').textContent = capitalize(key);
  const hiddenInput = document.getElementById('productSelect');
  hiddenInput.value = key;
  document.getElementById('dropdownMenu').classList.remove('show');
  hiddenInput.dispatchEvent(new Event('change'));
};

function placeOrder() {
  const productSelect = document.getElementById('productSelect');
  const quantityInput = document.getElementById('quantityInput');
  const customerInput = document.getElementById('customerInput');
  const messageInput = document.getElementById('messageInput');
  const paymentMethodInput = document.getElementById('paymentMethod');

  const product = productSelect.value;
  const qty = parseInt(quantityInput.value);
  const customer = customerInput.value.trim();
  const paymentMethod = paymentMethodInput.value;

  if (!product || !qty || qty < 1) {
    alert('Please select a product and enter a valid quantity.');
    return;
  }

  const productName = capitalize(product);
  const price = CATALOG[product.toLowerCase()] || 0;
  const total = price * qty;
  const itemLine = `${productName} - ${qty} - ${price} - ${total}`;
  
  const currentVal = messageInput.value.trim();

  if (currentVal.toUpperCase().startsWith('ORDER')) {
    // Append new item
    // Check if last line is likely customer (not an item) to insert before it
    const lines = currentVal.split('\n');
    const lastLine = lines[lines.length-1].trim();
    const isItem = lastLine.match(/^.+? - \d+ - [\d.]+ - [\d.]+$/) || lastLine.match(/^\d+x .+/);
    
    if (!isItem && lines.length > 1) {
       lines.splice(lines.length-1, 0, itemLine);
       messageInput.value = lines.join('\n');
    } else {
       messageInput.value = currentVal + '\n' + itemLine;
    }
  } else {
    messageInput.value = `ORDER\n${itemLine}`;
    if (customer) {
      messageInput.value += `\n${customer}`;
    }
    if (paymentMethod && paymentMethod !== 'Cash') {
      messageInput.value += `\nPayment: ${paymentMethod}`;
    }
  }

  // Clear form
  productSelect.value = '';
  document.getElementById('dropdownSelected').textContent = 'Select Product';
  quantityInput.value = 1;
  customerInput.value = '';
  updateLiveTotal();
  messageInput.focus();
}

function copyOrderDetails(orderId) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;

  const text = [
    `ORDER: ${order.id}`,
    `Customer: ${order.phone}`,
    `Date: ${new Date(order.timestamp).toLocaleString()}`,
    `Payment: ${order.paymentMethod || 'Cash'}`,
    `Status: ${capitalize(order.status)}`,
    `Items:\n${order.items.map(i => `- ${i.qty}x ${i.name}`).join('\n')}`,
    `Total: GH₵ ${order.total.toLocaleString()}`,
    order.notes ? `Notes: ${order.notes}` : ''
  ].filter(Boolean).join('\n');

  navigator.clipboard.writeText(text).then(() => {
    showToast('Order copied to clipboard! 📋');
  }).catch(err => console.error('Copy failed:', err));
}

function editOrder(orderId) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;

  // Create modal HTML
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>Edit Order ${orderId}</h3>
        <button class="close" onclick="closeModal()">&times;</button>
      </div>
      <form id="editOrderForm">
        <div class="form-group">
          <label for="editCustomer">Customer Name:</label>
          <input type="text" id="editCustomer" value="${order.phone}" required>
        </div>
        <div class="form-group">
          <label for="editPayment">Payment Method:</label>
          <select id="editPayment">
            <option value="Cash" ${order.paymentMethod === 'Cash' ? 'selected' : ''}>Cash</option>
            <option value="Momo" ${order.paymentMethod === 'Momo' ? 'selected' : ''}>Momo</option>
            <option value="Credit" ${order.paymentMethod === 'Credit' ? 'selected' : ''}>Credit</option>
          </select>
        </div>
        <div class="form-group">
          <label for="editItems">Items (one per line):</label>
          <textarea id="editItems" rows="5" required>${order.items.map(i => `${i.name} - ${i.qty} - ${i.price/i.qty} - ${i.price}`).join('\n')}</textarea>
        </div>
        <div class="form-group">
          <label for="editNotes">Notes:</label>
          <textarea id="editNotes" rows="3">${order.notes || ''}</textarea>
        </div>
        <div class="form-group">
          <label for="editStatus">Status:</label>
          <select id="editStatus">
            <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="confirmed" ${order.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
            <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Delivered</option>
          </select>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-delete" onclick="closeModal()">Cancel</button>
          <button type="button" class="btn" onclick="copyOrderDetails('${orderId}')" style="background-color: #607d8b; color: white; margin-right: 10px;">📋 Copy</button>
          <button type="submit" class="btn btn-confirm">Save Changes</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);
  modal.style.display = 'flex';

  // Handle form submission
  document.getElementById('editOrderForm').addEventListener('submit', function(e) {
    e.preventDefault();

    const newCustomer = document.getElementById('editCustomer').value.trim();
    const newItemsStr = document.getElementById('editItems').value.trim();
    const newNotes = document.getElementById('editNotes').value.trim();
    const newStatus = document.getElementById('editStatus').value;
    const newPayment = document.getElementById('editPayment').value;

    if (!newCustomer) {
      alert('Customer name is required.');
      return;
    }

    // Update order
    const oldStatus = order.status;
    order.phone = newCustomer;
    order.items = parseItemsString(newItemsStr);
    order.total = order.items.reduce((sum, i) => sum + i.price, 0);
    order.notes = newNotes;
    order.status = newStatus;
    order.paymentMethod = newPayment;

    // Add history entry if status changed
    if (oldStatus !== newStatus) {
      order.history.push({
        action: 'status_changed',
        timestamp: new Date().toISOString(),
        details: `Status changed from ${capitalize(oldStatus)} to ${capitalize(newStatus)}`
      });
    }

    saveOrders();
    renderOrders();
    updateStats();
    pushToPowerBI(order);
    closeModal();

    // Add chat message for status change
    if (oldStatus !== newStatus) {
      addChatMessage(`📝 Order ${orderId} status updated to ${capitalize(newStatus)}`, 'outgoing');
    }
  });
}

function saveOrderChanges() {
  const orderId = document.getElementById('editOrderId').value;
  const order = orders.find(o => o.id === orderId);
  if (!order) return;

  const newCustomer = document.getElementById('editCustomerName').value.trim();
  const newItemsStr = document.getElementById('editOrderItems').value.trim();
  const newStatus = document.getElementById('editOrderStatus').value;

  if (!newCustomer) {
    alert('Customer name is required.');
    return;
  }

  const newItems = parseItemsString(newItemsStr);
  order.phone = newCustomer;
  order.items = newItems;
  order.total = newItems.reduce((sum, i) => sum + i.price, 0);
  
  if (order.status !== newStatus) {
    order.history.push({
      action: 'status_changed',
      timestamp: new Date().toISOString(),
      details: `Status changed from ${capitalize(order.status)} to ${capitalize(newStatus)}`
    });
    order.status = newStatus;
  }

  saveOrders();
  renderOrders();
  updateStats();
    pushToPowerBI(order);
  document.getElementById('editOrderModal').style.display = 'none';

  // Optionally, show a toast notification
  showToast('Order updated successfully!');
}

function closeModal() {
  const modal = document.querySelector('.modal');
  if (modal) {
    modal.remove();
  }
}

function showToast(message) {
  const toastContainer = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3000); // Remove after 3 seconds
}

function clearAllOrders() {
  if (confirm('⚠️ WARNING: Are you sure you want to DELETE ALL orders?\n\nThis action cannot be undone!')) {
    if (confirm('Are you really sure? All data will be lost.')) {
      orders = [];
      orderIdCounter = 1001;
      saveOrders();
      renderOrders();
      updateStats();
      showToast('All orders cleared successfully');
    }
  }
}

function openRecycleBin() {
  cleanupDeletedOrders();
  
  if (deletedOrders.length === 0) {
    alert('Recycle Bin is empty.');
    return;
  }

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'recycleBinModal';
  
  const listHtml = deletedOrders.map(o => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #eee;">
      <div>
        <div style="font-weight: bold;">${o.id} - ${o.phone}</div>
        <div style="font-size: 0.85em; color: #666;">Deleted: ${new Date(o.deletedTimestamp).toLocaleDateString()}</div>
        <div style="font-size: 0.85em; color: #666;">Total: GH₵ ${o.total.toLocaleString()}</div>
      </div>
      <div>
        <button onclick="restoreOrder('${o.id}')" style="background: #00a884; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; margin-right: 5px;">Restore</button>
        <button onclick="permanentlyDeleteOrder('${o.id}')" style="background: #dc3545; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">Delete</button>
      </div>
    </div>
  `).join('');

  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px; max-height: 80vh; display: flex; flex-direction: column;">
      <div class="modal-header">
        <h3>♻️ Recycle Bin (${deletedOrders.length})</h3>
        <button class="close" onclick="closeModal()">&times;</button>
      </div>
      <div style="overflow-y: auto; flex: 1; padding: 10px;">
        ${listHtml}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal()">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.style.display = 'flex';
}

function restoreOrder(orderId) {
  const index = deletedOrders.findIndex(o => o.id === orderId);
  if (index !== -1) {
    const order = deletedOrders[index];
    delete order.deletedTimestamp;
    
    orders.push(order);
    // Sort by timestamp descending to maintain order
    orders.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    deletedOrders.splice(index, 1);
    localStorage.setItem('whatsapp_deleted_orders', JSON.stringify(deletedOrders));
    saveOrders();
    renderOrders();
    updateStats();
    
    document.getElementById('recycleBinModal').remove();
    if (deletedOrders.length > 0) openRecycleBin();
    showToast('Order restored successfully! 🎉');
  }
}

function permanentlyDeleteOrder(orderId) {
  if (confirm('Are you sure you want to PERMANENTLY delete this order? This cannot be undone.')) {
    const index = deletedOrders.findIndex(o => o.id === orderId);
    if (index !== -1) {
      deletedOrders.splice(index, 1);
      localStorage.setItem('whatsapp_deleted_orders', JSON.stringify(deletedOrders));
      
      document.getElementById('recycleBinModal').remove();
      if (deletedOrders.length > 0) openRecycleBin();
      showToast('Order permanently deleted.');
    }
  }
}

function cleanupDeletedOrders() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const initialLen = deletedOrders.length;
  deletedOrders = deletedOrders.filter(o => new Date(o.deletedTimestamp) > thirtyDaysAgo);
  
  if (deletedOrders.length !== initialLen) {
    localStorage.setItem('whatsapp_deleted_orders', JSON.stringify(deletedOrders));
  }
}

async function exportOrders() {
  try {
    if (orders.length === 0) {
      alert('No orders to export.');
      return;
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'WhatsApp Order App';
    workbook.created = new Date();

    // --- Helper for styling ---
    const headerStyle = {
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF075E54' } },
      font: { color: { argb: 'FFFFFFFF' }, bold: true },
      alignment: { horizontal: 'center', vertical: 'middle' }
    };

    // --- "All Orders" Sheet ---
    const ordersSheet = workbook.addWorksheet('All Orders');
    ordersSheet.columns = [
      { header: 'Order ID', key: 'id', width: 15 },
      { header: 'Timestamp', key: 'timestamp', width: 20 },
      { header: 'Customer Name', key: 'phone', width: 20 },
      { header: 'Items', key: 'items', width: 50 },
      { header: 'Total', key: 'total', width: 15, style: { numFmt: '"GH₵"#,##0' } },
      { header: 'Payment', key: 'paymentMethod', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Notes', key: 'notes', width: 30 },
      { header: 'Sales Rep', key: 'salesRep', width: 20 }
    ];
    ordersSheet.getRow(1).font = headerStyle.font;
    ordersSheet.getRow(1).fill = headerStyle.fill;
    ordersSheet.getRow(1).alignment = headerStyle.alignment;

    orders.forEach(order => {
      ordersSheet.addRow({
        id: order.id,
        timestamp: order.timestamp,
        phone: order.phone,
        items: order.items.map(i => `${i.qty}x ${i.name}${i.color && i.collection ? ` (${i.color}, ${i.collection})` : ''}`).join('\n'),
        total: order.total,
        paymentMethod: order.paymentMethod || 'Cash',
        status: order.status,
        notes: order.notes || '',
        salesRep: order.salesRep || ''
      });
    });

    // --- Download File ---
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().split('T')[0];
    link.download = `Orders_Backup_${dateStr}.xlsx`;
    link.click();

    alert('Orders exported successfully!');
  } catch (error) {
    alert('Error exporting orders: ' + error.message);
    console.error('Export error:', error);
  }
}

async function importOrders(event) {
  try {
    const file = event.target.files[0];
    if (!file) return;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());

    const ordersSheet = workbook.getWorksheet('All Orders');
    if (!ordersSheet) {
      alert('Invalid file format. Please select a valid orders backup file.');
      return;
    }

    const importedOrders = [];
    ordersSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      const rowData = row.values;
      if (rowData.length < 7) return; // Skip incomplete rows

      try {
        // Parse items from readable format: "2x Burger, 1x Coke"
        const itemsText = rowData[4] || '';
        const items = [];
        if (itemsText) {
          const itemMatches = itemsText.split(/[,\n]+/);
          for (const itemStr of itemMatches) {
            const match = itemStr.trim().match(/(\d+)x (.+)/);
            if (match) {
              const qty = parseInt(match[1]);
              const name = match[2];
              const price = CATALOG[name.toLowerCase()] || 25000;
              items.push({ name: capitalize(name), qty, price: price * qty });
            }
          }
        }

        const order = {
          id: rowData[1],
          timestamp: rowData[2],
          phone: rowData[3],
          items: items,
          total: parseFloat(rowData[5]),
          paymentMethod: rowData[6] || 'Cash',
          status: rowData[7],
          notes: rowData[8] || '',
          salesRep: rowData[9] || 'System',
          history: []
        };

        // Validate order structure
        if (order.id && order.timestamp && order.items && Array.isArray(order.items)) {
          importedOrders.push(order);
        }
      } catch (e) {
        console.warn('Skipping invalid order row:', rowNumber, e);
      }
    });

    if (importedOrders.length === 0) {
      alert('No valid orders found in the file.');
      return;
    }

    // Confirm import
    if (!confirm(`Import ${importedOrders.length} orders? This will replace all current orders.`)) {
      return;
    }

    // Update orders and counters
    orders = importedOrders;
    orderIdCounter = orders.length > 0 ? Math.max(...orders.map(o => parseInt(o.id.replace('ORD-', '')))) + 1 : 1001;

    saveOrders();
    renderOrders();
    updateStats();

    alert(`Successfully imported ${importedOrders.length} orders!`);
  } catch (error) {
    alert('Error importing orders: ' + error.message);
    console.error('Import error:', error);
  } finally {
    // Reset file input
    event.target.value = '';
  }
}

async function downloadExcel() {
  try {
    const now = new Date();
    const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);

    // Filter by date only (include Pending, Confirmed, Delivered)
    const filteredOrders = orders.filter(order => new Date(order.timestamp) >= fortyDaysAgo);

    if (filteredOrders.length === 0) {
      alert('No orders in the last 40 days.');
      return;
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'WhatsApp Order App';
    workbook.created = new Date();

    // --- Helper for styling ---
    const headerStyle = {
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF075E54' } },
      font: { color: { argb: 'FFFFFFFF' }, bold: true },
      alignment: { horizontal: 'center', vertical: 'middle' }
    };

    // --- "All Orders" Sheet ---
    const ordersSheet = workbook.addWorksheet('All Orders');
    ordersSheet.columns = [
      { header: 'Order ID: Unique identifier for each order (e.g., ORD-1001)', key: 'id', width: 30 },
      { header: 'Date: Date and time when the order was placed', key: 'date', width: 25 },
      { header: 'Customer Phone: Phone number or name of the customer who placed the order', key: 'phone', width: 30 },
      { header: 'Items: List of items ordered with quantities (e.g., 2x Pizza, 1x Coke)', key: 'items', width: 50 },
      { header: 'Sales Rep', key: 'salesRep', width: 20 },
      { header: 'Total: Total cost of the order in Ghanaian Cedis (GH₵)', key: 'total', width: 25, style: { numFmt: '"GH₵"#,##0' } },
      { header: 'Payment', key: 'paymentMethod', width: 15 },
      { header: 'Status: Current status of the order: Pending, Confirmed, or Delivered', key: 'status', width: 25 }
    ];
    ordersSheet.getRow(1).font = headerStyle.font;
    ordersSheet.getRow(1).fill = headerStyle.fill;
    ordersSheet.getRow(1).alignment = headerStyle.alignment;

    filteredOrders.forEach(order => {
      ordersSheet.addRow({
        id: order.id,
        date: new Date(order.timestamp),
        phone: order.phone,
        items: order.items.map(i => `${i.qty}x ${i.name}`).join('\n'),
        salesRep: order.salesRep || '',
        total: order.total,
        paymentMethod: order.paymentMethod || 'Cash',
        status: capitalize(order.status)
      });
    });

    // Style status cells
    ordersSheet.getColumn('status').eachCell((cell, rowNumber) => {
      if (rowNumber > 1) {
        const status = cell.value;
        if (status === 'Confirmed') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } };
          cell.font = { color: { argb: 'FF155724' }, bold: true };
        } else if (status === 'Pending') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
          cell.font = { color: { argb: 'FF856404' }, bold: true };
        } else if (status === 'Delivered') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCE5FF' } };
          cell.font = { color: { argb: 'FF004085' }, bold: true };
        }
      }
    });

    // --- "Order Details" Sheet ---
    const detailsSheet = workbook.addWorksheet('Order Details');
    detailsSheet.columns = [
      { header: 'Order ID', key: 'id', width: 15 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Customer', key: 'customer', width: 20 },
      { header: 'Item Name', key: 'itemName', width: 20 },
      { header: 'Quantity', key: 'qty', width: 10 },
      { header: 'Price per Item', key: 'pricePerItem', width: 15, style: { numFmt: '"GH₵"#,##0' } },
      { header: 'Total for Item', key: 'totalForItem', width: 15, style: { numFmt: '"GH₵"#,##0' } },
      { header: 'Payment', key: 'paymentMethod', width: 15 },
      { header: 'Order Status', key: 'status', width: 15 },
      { header: 'Sales Rep', key: 'salesRep', width: 20 }
    ];
    detailsSheet.getRow(1).font = headerStyle.font;
    detailsSheet.getRow(1).fill = headerStyle.fill;
    detailsSheet.getRow(1).alignment = headerStyle.alignment;

    filteredOrders.forEach(order => {
      order.items.forEach(item => {
        detailsSheet.addRow({
          id: order.id,
          date: new Date(order.timestamp),
          customer: order.phone,
          itemName: item.name,
          qty: item.qty,
          pricePerItem: item.price / item.qty,
          totalForItem: item.price,
          paymentMethod: order.paymentMethod || 'Cash',
          status: capitalize(order.status),
          salesRep: order.salesRep || ''
        });
      });
    });

    // Style status cells in details sheet
    detailsSheet.getColumn('status').eachCell((cell, rowNumber) => {
      if (rowNumber > 1) {
        const status = cell.value;
        if (status === 'Confirmed') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } };
          cell.font = { color: { argb: 'FF155724' }, bold: true };
        } else if (status === 'Pending') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
          cell.font = { color: { argb: 'FF856404' }, bold: true };
        } else if (status === 'Delivered') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCE5FF' } };
          cell.font = { color: { argb: 'FF004085' }, bold: true };
        }
      }
    });

    // --- "Analytics" Sheet ---
    const analyticsSheet = workbook.addWorksheet('Analytics');
    const totalOrders = filteredOrders.length;
    // Calculate revenue only for Confirmed and Delivered orders
    const revenueOrders = filteredOrders.filter(o => o.status === 'confirmed' || o.status === 'delivered');
    const totalRevenue = revenueOrders.reduce((sum, order) => sum + order.total, 0);
    const avgOrderValue = revenueOrders.length > 0 ? totalRevenue / revenueOrders.length : 0;
    const uniqueCustomers = new Set(filteredOrders.map(order => order.phone)).size;
    const totalItemsSold = filteredOrders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.qty, 0), 0);
    const pendingOrders = filteredOrders.filter(o => o.status === 'pending').length;
    const confirmedOrders = filteredOrders.filter(o => o.status === 'confirmed').length;
    const deliveredOrders = filteredOrders.filter(o => o.status === 'delivered').length;

    analyticsSheet.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 30 }
    ];
    analyticsSheet.getRow(1).font = headerStyle.font;
    analyticsSheet.getRow(1).fill = headerStyle.fill;
    analyticsSheet.getRow(1).alignment = headerStyle.alignment;

    const analyticsData = [
      { metric: 'Total Orders', value: totalOrders },
      { metric: 'Pending Orders', value: pendingOrders },
      { metric: 'Confirmed Orders', value: confirmedOrders },
      { metric: 'Delivered Orders', value: deliveredOrders },
      { metric: 'Total Revenue', value: { value: totalRevenue, style: { numFmt: '"GH₵"#,##0' } } },
      { metric: 'Average Order Value', value: { value: avgOrderValue, style: { numFmt: '"GH₵"#,##0' } } },
      { metric: 'Unique Customers', value: uniqueCustomers },
      { metric: 'Total Items Sold', value: totalItemsSold },
      { metric: 'Period', value: `Last 40 days (${fortyDaysAgo.toLocaleDateString()} - ${now.toLocaleDateString()})` }
    ];
    analyticsData.forEach(d => {
      const row = analyticsSheet.addRow(d);
      row.getCell('metric').font = { bold: true };
      if (typeof d.value === 'object' && d.value.value !== undefined) {
          row.getCell('value').value = d.value.value;
          row.getCell('value').style = d.value.style;
      }
    });

    // --- "Top Products" Sheet ---
    const topProductsSheet = workbook.addWorksheet('Top Products');
    topProductsSheet.columns = [
      { header: 'Product Name', key: 'name', width: 30 },
      { header: 'Quantity Sold', key: 'qty', width: 15 },
      { header: 'Total Revenue', key: 'revenue', width: 20, style: { numFmt: '"GH₵"#,##0' } }
    ];
    topProductsSheet.getRow(1).font = headerStyle.font;
    topProductsSheet.getRow(1).fill = headerStyle.fill;
    topProductsSheet.getRow(1).alignment = headerStyle.alignment;

    const productStats = {};
    // Use revenueOrders (Confirmed/Delivered) for accurate sales data
    revenueOrders.forEach(order => {
      order.items.forEach(item => {
        const name = item.name;
        if (!productStats[name]) {
          productStats[name] = { qty: 0, revenue: 0 };
        }
        productStats[name].qty += item.qty;
        productStats[name].revenue += item.price;
      });
    });

    const sortedProducts = Object.entries(productStats)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.qty - a.qty);

    sortedProducts.forEach(prod => {
      topProductsSheet.addRow(prod);
    });

    if (sortedProducts.length > 0) {
      topProductsSheet.addTable({
        name: 'TopProductsData',
        ref: 'A1',
        headerRow: true,
        totalsRow: false,
        columns: [
          { name: 'Product Name', filterButton: true },
          { name: 'Quantity Sold', totalsRowFunction: 'sum', filterButton: false },
          { name: 'Total Revenue', totalsRowFunction: 'sum', filterButton: false }
        ],
        style: { theme: 'TableStyleMedium2', showRowStripes: true }
      });

      const chartRows = Math.min(sortedProducts.length, 10);
      topProductsSheet.addChart({
        title: 'Top 10 Best Selling Products',
        type: 'bar',
        ref: 'E2',
        size: { width: 600, height: 400 },
        series: [{
          data: `B2:B${chartRows + 1}`,
          labels: `A2:A${chartRows + 1}`
        }]
      });
    }

    // --- "Customer Leaderboard" Sheet ---
    const customerSheet = workbook.addWorksheet('Customer Leaderboard');
    customerSheet.columns = [
      { header: 'Customer Name', key: 'name', width: 30 },
      { header: 'Total Orders', key: 'count', width: 15 },
      { header: 'Total Spent', key: 'spent', width: 20, style: { numFmt: '"GH₵"#,##0' } }
    ];
    customerSheet.getRow(1).font = headerStyle.font;
    customerSheet.getRow(1).fill = headerStyle.fill;
    customerSheet.getRow(1).alignment = headerStyle.alignment;

    const customerStats = {};
    revenueOrders.forEach(order => {
      const customer = order.phone;
      if (!customerStats[customer]) {
        customerStats[customer] = { count: 0, spent: 0 };
      }
      customerStats[customer].count += 1;
      customerStats[customer].spent += order.total;
    });

    const sortedCustomers = Object.entries(customerStats)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.spent - a.spent);

    sortedCustomers.forEach(cust => {
      customerSheet.addRow(cust);
    });

    if (sortedCustomers.length > 0) {
      customerSheet.addTable({
        name: 'CustomerLeaderboardData',
        ref: 'A1',
        headerRow: true,
        totalsRow: false,
        columns: [
          { name: 'Customer Name', filterButton: true },
          { name: 'Total Orders', totalsRowFunction: 'sum', filterButton: false },
          { name: 'Total Spent', totalsRowFunction: 'sum', filterButton: false }
        ],
        style: { theme: 'TableStyleMedium2', showRowStripes: true }
      });

      const chartRows = Math.min(sortedCustomers.length, 10);
      customerSheet.addChart({
        title: 'Top 10 Customers by Spend',
        type: 'bar',
        ref: 'E2',
        size: { width: 600, height: 400 },
        series: [{
          data: `C2:C${chartRows + 1}`,
          labels: `A2:A${chartRows + 1}`
        }]
      });
    }

    // --- "Column Definitions" Sheet ---
    const definitionsSheet = workbook.addWorksheet('Column Definitions');
    definitionsSheet.columns = [
      { header: 'Sheet Name', key: 'sheet', width: 20 },
      { header: 'Column Name', key: 'column', width: 20 },
      { header: 'Definition', key: 'definition', width: 50 }
    ];
    definitionsSheet.getRow(1).font = headerStyle.font;
    definitionsSheet.getRow(1).fill = headerStyle.fill;
    definitionsSheet.getRow(1).alignment = headerStyle.alignment;

    const definitions = [
      { sheet: 'All Orders', column: 'Order ID', definition: 'Unique identifier for each order (e.g., ORD-1001)' },
      { sheet: 'All Orders', column: 'Date', definition: 'Date and time when the order was placed' },
      { sheet: 'All Orders', column: 'Customer Phone', definition: 'Phone number or name of the customer who placed the order' },
      { sheet: 'All Orders', column: 'Items', definition: 'List of items ordered with quantities (e.g., 2x Pizza, 1x Coke)' },
      { sheet: 'All Orders', column: 'Total', definition: 'Total cost of the order in Ghanaian Cedis (GH₵)' },
      { sheet: 'All Orders', column: 'Status', definition: 'Current status of the order: Pending, Confirmed, or Delivered' },
      { sheet: 'Order Details', column: 'Order ID', definition: 'Unique identifier for each order (e.g., ORD-1001)' },
      { sheet: 'Order Details', column: 'Date', definition: 'Date and time when the order was placed' },
      { sheet: 'Order Details', column: 'Customer', definition: 'Phone number or name of the customer who placed the order' },
      { sheet: 'Order Details', column: 'Item Name', definition: 'Name of the individual item ordered' },
      { sheet: 'Order Details', column: 'Quantity', definition: 'Number of units of the item ordered' },
      { sheet: 'Order Details', column: 'Price per Item', definition: 'Cost per unit of the item in Ghanaian Cedis (GH₵)' },
      { sheet: 'Order Details', column: 'Total for Item', definition: 'Total cost for this item (Quantity × Price per Item) in Ghanaian Cedis (GH₵)' },
      { sheet: 'Order Details', column: 'Order Status', definition: 'Current status of the order: Pending, Confirmed, or Delivered' },
      { sheet: 'Top Products', column: 'Product Name', definition: 'Name of the product' },
      { sheet: 'Top Products', column: 'Quantity Sold', definition: 'Total units sold (Confirmed & Delivered only)' },
      { sheet: 'Top Products', column: 'Total Revenue', definition: 'Total revenue generated by this product' },
      { sheet: 'Customer Leaderboard', column: 'Customer Name', definition: 'Name or phone number of the customer' },
      { sheet: 'Customer Leaderboard', column: 'Total Orders', definition: 'Total number of confirmed/delivered orders placed by this customer' },
      { sheet: 'Customer Leaderboard', column: 'Total Spent', definition: 'Total value of all confirmed/delivered orders from this customer' },
      { sheet: 'Analytics', column: 'Metric', definition: 'Name of the analytical metric being measured' },
      { sheet: 'Analytics', column: 'Value', definition: 'Numerical value or description for the corresponding metric' }
    ];
    definitions.forEach(def => {
      definitionsSheet.addRow(def);
    });

    // --- "Charts" Sheet ---
    const chartSheet = workbook.addWorksheet('Charts');
    chartSheet.columns = [
      { header: 'Status: Order status category (Pending, Confirmed, or Delivered)', key: 'status', width: 20 },
      { header: 'Count: Number of orders in this status', key: 'count', width: 15 }
    ];
    chartSheet.getRow(1).font = headerStyle.font;
    chartSheet.getRow(1).fill = headerStyle.fill;
    chartSheet.getRow(1).alignment = headerStyle.alignment;

    chartSheet.addRow({ status: 'Pending', count: pendingOrders });
    chartSheet.addRow({ status: 'Confirmed', count: confirmedOrders });
    chartSheet.addRow({ status: 'Delivered', count: deliveredOrders });

    chartSheet.addTable({
      name: 'OrderStatusData',
      ref: 'A1',
      headerRow: true,
      totalsRow: false,
      columns: [
        { name: 'Status: Order status category (Pending, Confirmed, or Delivered)', filterButton: true },
        { name: 'Count: Number of orders in this status', totalsRowFunction: 'sum', filterButton: false }
      ],
      style: {
        theme: 'TableStyleMedium2',
        showRowStripes: true
      }
    });

    chartSheet.addChart({
      title: 'Order Status Distribution',
      type: 'pie',
      ref: 'D2',
      size: { width: 500, height: 300 },
      series: [{
        data: 'B2:B4',
        labels: 'A2:A4'
      }]
    });

    // --- Payment Split Chart ---
    const creditCount = filteredOrders.filter(o => o.paymentMethod === 'Credit').length;
    const paidCount = filteredOrders.filter(o => o.paymentMethod !== 'Credit').length;

    chartSheet.addRow([]); // Spacer
    const paymentHeaderRow = chartSheet.addRow(['Payment Type', 'Count']);
    paymentHeaderRow.font = headerStyle.font;
    paymentHeaderRow.fill = headerStyle.fill;
    paymentHeaderRow.alignment = headerStyle.alignment;

    chartSheet.addRow(['Paid', paidCount]);
    chartSheet.addRow(['Credit', creditCount]);

    chartSheet.addTable({
      name: 'PaymentStatusData',
      ref: 'A6',
      headerRow: true,
      totalsRow: false,
      columns: [
        { name: 'Payment Type', filterButton: true },
        { name: 'Count', totalsRowFunction: 'sum', filterButton: false }
      ],
      style: { theme: 'TableStyleMedium2', showRowStripes: true }
    });

    chartSheet.addChart({
      title: 'Paid vs Credit',
      type: 'pie',
      ref: 'D18',
      size: { width: 500, height: 300 },
      series: [{
        data: 'B7:B8',
        labels: 'A7:A8'
      }]
    });

    // --- Download File ---
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const dateStr = now.toISOString().split('T')[0];
    link.download = `Orders_Report_${dateStr}.xlsx`;
    link.click();
  } catch (error) {
    alert('Error generating Excel file: ' + error.message);
    console.error('Download Excel error:', error);
  }
}

async function pushToPowerBI(order) {
  if (!POWERBI_API_URL) return;

  try {
    const payload = [{
      "timestamp": new Date().toISOString(),
      "order_id": order.id,
      "customer": order.phone,
      "total": order.total,
      "payment_method": order.paymentMethod || 'Cash',
      "sales_rep": order.salesRep || 'System',
      "status": order.status,
      "items": order.items.map(i => `${i.qty}x ${i.name}`).join('\n'),
      "order_timestamp": order.timestamp
    }];

    await fetch(POWERBI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error('PowerBI Push Error:', error);
  }
}

function showCustomerHistory(customerPhone) {
  const customerOrders = orders.filter(o => o.phone === customerPhone);

  if (customerOrders.length === 0) {
    alert(`No orders found for customer ${customerPhone}`);
    return;
  }

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 600px;">
      <div class="modal-header">
        <h3>Order History for ${customerPhone} (${customerOrders.length} orders)</h3>
        <button class="close" onclick="closeModal()">&times;</button>
      </div>
      <div style="overflow-y: auto; max-height: 500px; padding: 1rem;">
        ${customerOrders.map(order => `
          <div style="border-bottom: 1px solid #eee; padding: 10px 0;">
            <div>Order ID: ${order.id}</div>
            <div>Date: ${new Date(order.timestamp).toLocaleString()}</div>
            <div>Total: GH₵ ${order.total.toLocaleString()}</div>
            <div>Status: ${capitalize(order.status)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.style.display = 'flex';
}

function showCreditOrders() {
  const creditOrders = orders.filter(o => o.paymentMethod === 'Credit');
  
  if (creditOrders.length === 0) {
    alert('No outstanding credit orders.');
    return;
  }

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'creditOrdersModal';
  
  const listHtml = creditOrders.map(o => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #eee;">
      <div>
        <div style="font-weight: bold; font-size: 1rem;">${o.phone}</div>
        <div style="font-size: 0.85em; color: #666;">${o.id} • ${new Date(o.timestamp).toLocaleDateString()}</div>
        <div style="font-size: 0.85em; color: #666;">${o.items.length} items</div>
      </div>
      <div style="text-align: right;">
        <div style="font-weight: bold; color: #ef5350; margin-bottom: 4px;">GH₵ ${o.total.toLocaleString()}</div>
        <button onclick="markOrderPaid('${o.id}')" style="background: #00a884; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.85em;">Mark Paid</button>
      </div>
    </div>
  `).join('');

  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px; max-height: 80vh; display: flex; flex-direction: column; padding: 0;">
      <div class="modal-header" style="padding: 1.5rem; border-bottom: 1px solid #eee; margin-bottom: 0;">
        <h3 style="margin: 0;">Outstanding Credits (${creditOrders.length})</h3>
        <button class="close" onclick="closeModal()" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">&times;</button>
      </div>
      <div style="overflow-y: auto; flex: 1; padding: 0 1.5rem;">
        ${listHtml}
      </div>
      <div class="modal-footer" style="padding: 1.5rem; border-top: 1px solid #eee; margin-top: 0;">
        <button class="btn btn-secondary" onclick="closeModal()">Close</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.style.display = 'flex';
}

function markOrderPaid(orderId) {
  if (confirm('Mark this order as Paid (Cash)?')) {
    const order = orders.find(o => o.id === orderId);
    if (order) {
      order.paymentMethod = 'Cash';
      saveOrders();
      renderOrders();
      updateStats();
      pushToPowerBI(order);
      
      // Refresh modal
      document.getElementById('creditOrdersModal').remove();
      // If there are still credit orders, reopen modal
      if (orders.some(o => o.paymentMethod === 'Credit')) {
        showCreditOrders();
      } else {
        showToast('All credit orders cleared! 🎉');
      }
    }
  }
}

// --- Quick Tour Feature ---
let currentTourStep = 0;
const TOUR_STEPS = [
  {
    id: 'btnPlaceOrder',
    title: 'Place Orders',
    text: 'Fill in the form above and click here to create a new order instantly.'
  },
  {
    id: 'ordersList',
    title: 'Manage Orders',
    text: 'View your orders here. You can Edit, Confirm, or Delete them.'
  },
  {
    id: 'statCredit',
    title: 'Track Credits',
    text: 'See outstanding debts here. Click the "Pay" button to settle payments.'
  },
  {
    id: 'btnExport',
    title: 'Export Data',
    text: 'Download your sales data to Excel for reporting and backup.'
  }
];

function startTour() {
  if (document.querySelector('.tour-overlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'tour-overlay';
  document.body.appendChild(overlay);

  const tooltip = document.createElement('div');
  tooltip.className = 'tour-tooltip';
  tooltip.id = 'tourTooltip';
  document.body.appendChild(tooltip);

  overlay.style.display = 'block';
  currentTourStep = 0;
  showTourStep();
}

function showTourStep() {
  const step = TOUR_STEPS[currentTourStep];
  const element = document.getElementById(step.id);
  const tooltip = document.getElementById('tourTooltip');
  
  document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));

  if (!element) { endTour(); return; }

  element.classList.add('tour-highlight');
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });

  tooltip.innerHTML = `
    <h3>${step.title}</h3>
    <p>${step.text}</p>
    <div class="tour-footer">
      <span class="tour-step-count">${currentTourStep + 1} of ${TOUR_STEPS.length}</span>
      <div>
        <button onclick="endTour()" style="background:none; border:none; color:#666; cursor:pointer; margin-right:10px;">Skip</button>
        <button onclick="nextTourStep()" class="btn btn-confirm" style="padding: 6px 12px; font-size:0.9rem;">${currentTourStep === TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}</button>
      </div>
    </div>
  `;
  tooltip.style.display = 'block';

  const rect = element.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  
  let top = rect.bottom + 15;
  let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);

  if (left < 10) left = 10;
  if (left + tooltipRect.width > window.innerWidth) left = window.innerWidth - tooltipRect.width - 10;
  if (top + tooltipRect.height > window.innerHeight) top = rect.top - tooltipRect.height - 15;

  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
}

function nextTourStep() {
  currentTourStep++;
  if (currentTourStep >= TOUR_STEPS.length) endTour();
  else showTourStep();
}

function endTour() {
  document.querySelector('.tour-overlay')?.remove();
  document.getElementById('tourTooltip')?.remove();
  document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
  localStorage.setItem('whatsapp_tour_seen', 'true');
}

// --- Authentication ---

function checkAuth() {
  // Check if user is already logged in for this session
  if (!sessionStorage.getItem('whatsapp_auth')) {
    createLoginModal();
  }
}

function createLoginModal() {
  const existing = document.getElementById('loginModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'loginModal';
  modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #f0f2f5; z-index: 99999; display: flex; justify-content: center; align-items: center; flex-direction: column; backdrop-filter: blur(5px);';
  document.body.appendChild(modal);
  
  showLoginView();
}

window.showLoginView = function() {
  const modal = document.getElementById('loginModal');
  modal.innerHTML = `
    <div style="background: white; padding: 2.5rem; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); text-align: center; max-width: 300px; width: 90%;">
      <div style="font-size: 40px; margin-bottom: 10px;">🔐</div>
      <h2 style="margin: 0 0 10px 0; color: #075e54;">Login</h2>
      <p style="color: #666; margin-bottom: 20px;">Select your account</p>
      <select id="loginUser" style="padding: 12px; font-size: 16px; width: 100%; margin-bottom: 15px; border: 2px solid #e0e0e0; border-radius: 8px; background: white;">
        ${appUsers.map(u => `<option value="${u.name}">${u.name}</option>`).join('')}
      </select>
      <input type="password" id="loginPin" placeholder="Enter PIN" style="padding: 12px; font-size: 18px; width: 100%; margin-bottom: 20px; border: 2px solid #e0e0e0; border-radius: 8px; box-sizing: border-box; text-align: center;">
      <button onclick="verifyPin()" style="background: #128C7E; color: white; border: none; padding: 12px 0; width: 100%; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold; transition: background 0.2s; margin-bottom: 15px;">Login</button>
      <div style="border-top: 1px solid #eee; padding-top: 15px;">
        <button onclick="showRegisterView()" style="background: none; border: none; color: #128C7E; cursor: pointer; text-decoration: underline;">Create New Account</button>
      </div>
    </div>
  `;
  setTimeout(() => document.getElementById('loginPin').focus(), 100);
};

window.showRegisterView = function() {
  const modal = document.getElementById('loginModal');
  modal.innerHTML = `
    <div style="background: white; padding: 2.5rem; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); text-align: center; max-width: 300px; width: 90%;">
      <div style="font-size: 40px; margin-bottom: 10px;">👤</div>
      <h2 style="margin: 0 0 10px 0; color: #075e54;">Create Account</h2>
      <p style="color: #666; margin-bottom: 20px;">Enter details below</p>
      <input type="text" id="regName" placeholder="Your Name" style="padding: 12px; font-size: 16px; width: 100%; margin-bottom: 10px; border: 2px solid #e0e0e0; border-radius: 8px; box-sizing: border-box;">
      <select id="regRole" style="padding: 12px; font-size: 16px; width: 100%; margin-bottom: 10px; border: 2px solid #e0e0e0; border-radius: 8px; background: white;">
        <option value="employee">Employee</option>
        <option value="manager">Manager</option>
      </select>
      <input type="password" id="regPin" placeholder="Create PIN" style="padding: 12px; font-size: 18px; width: 100%; margin-bottom: 20px; border: 2px solid #e0e0e0; border-radius: 8px; box-sizing: border-box; text-align: center;">
      <button onclick="registerUser()" style="background: #128C7E; color: white; border: none; padding: 12px 0; width: 100%; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold; transition: background 0.2s; margin-bottom: 15px;">Create Account</button>
      <div style="border-top: 1px solid #eee; padding-top: 15px;">
        <button onclick="showLoginView()" style="background: none; border: none; color: #666; cursor: pointer;">Back to Login</button>
      </div>
    </div>
  `;
  setTimeout(() => document.getElementById('regName').focus(), 100);
};

window.registerUser = function() {
  const name = document.getElementById('regName').value.trim();
  const pin = document.getElementById('regPin').value.trim();
  const role = document.getElementById('regRole').value;
  if(!name || !pin) { alert('Please enter both name and PIN'); return; }
  if(appUsers.some(u => u.name.toLowerCase() === name.toLowerCase())) { alert('User already exists'); return; }
  appUsers.push({name, pin, role});
  localStorage.setItem('whatsapp_users', JSON.stringify(appUsers));
  alert('Account created! Please login.');
  showLoginView();
};

window.verifyPin = function() {
  const input = document.getElementById('loginPin');
  const userName = document.getElementById('loginUser').value;
  const user = appUsers.find(u => u.name === userName);
  
  if (user && user.pin === input.value) {
    sessionStorage.setItem('whatsapp_auth', 'true');
    sessionStorage.setItem('whatsapp_user', user.name);
    // Default Admin to manager, others to employee if role is missing
    sessionStorage.setItem('whatsapp_role', user.role || (user.name === 'Admin' ? 'manager' : 'employee'));
    const modal = document.getElementById('loginModal');
    modal.style.opacity = '0';
    modal.style.transition = 'opacity 0.3s';
    setTimeout(() => modal.remove(), 300);
    
    // Start tour if new user
    if (!localStorage.getItem('whatsapp_tour_seen')) {
      setTimeout(startTour, 500);
    }
  } else {
    input.style.borderColor = '#ff4444';
    alert('Incorrect PIN');
    input.value = '';
    input.focus();
  }
};
