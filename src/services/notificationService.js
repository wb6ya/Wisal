// src/services/notificationService.js
const axios = require('axios');
const Employee = require('../models/Employee');
const Company = require('../models/Company');

// اسم قالب الواتساب الذي ستنشئه لإعلام الموظفين
const NOTIFICATION_TEMPLATE_NAME = 'agent_notification';

/**
 * يرسل إشعارًا لكل موظفي الشركة عبر واتساب بطلب عميل جديد.
 * @param {string} companyId - معرّف الشركة.
 * @param {object} conversation - كائن المحادثة الذي يحتوي على بيانات العميل.
 */
async function notifyAgentsViaWhatsApp(companyId, conversation) {
    try {
        const company = await Company.findById(companyId);
        if (!company || !company.whatsapp.accessToken) {
            console.error(`Company ${companyId} not found or has no access token.`);
            return;
        }

        const employees = await Employee.find({ companyId: companyId });
        if (employees.length === 0) {
            console.log(`No employees found for company ${companyId} to notify.`);
            return;
        }

        const whatsappApiUrl = `https://graph.facebook.com/${process.env.META_API_VERSION}/${company.whatsapp.phoneNumberId}/messages`;
        const headers = { 'Authorization': `Bearer ${company.whatsapp.accessToken}` };

        for (const employee of employees) {
            // يفترض أن الموظفين لديهم حقل 'phoneNumber'. سنضيفه الآن.
            if (employee.phoneNumber) {
                const apiRequestData = {
                    messaging_product: "whatsapp",
                    to: employee.phoneNumber,
                    type: "template",
                    template: {
                        name: NOTIFICATION_TEMPLATE_NAME,
                        language: { code: "ar" }, // أو اللغة التي تفضلها
                        components: [{
                            type: "body",
                            parameters: [
                                { type: "text", text: conversation.customerName },
                                { type: "text", text: conversation.customerPhone }
                            ]
                        }]
                    }
                };
                await axios.post(whatsappApiUrl, apiRequestData, { headers });
                console.log(`Notification sent to employee ${employee.name} at ${employee.phoneNumber}`);
            }
        }
    } catch (error) {
        console.error("Failed to send agent notifications:", error.response ? error.response.data : error.message);
    }
}

module.exports = { notifyAgentsViaWhatsApp };