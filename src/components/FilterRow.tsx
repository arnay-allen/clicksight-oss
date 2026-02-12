import { CloseOutlined } from '@ant-design/icons';
import { AutoComplete, Button, Col, Input, InputNumber, Row, Select, Space, Tooltip } from 'antd';
import React, { useEffect, useState } from 'react';
import type { PropertyFilter } from '../lib/clickhouse';

const { Option } = Select;
// DatePicker unused for now
// const { RangePicker } = DatePicker;

interface FilterRowProps {
  filter: PropertyFilter;
  properties: string[];
  onUpdate: (field: keyof PropertyFilter, value: any) => void;
  onRemove: () => void;
  onPropertyChange?: (property: string) => void;
  propertyValues?: string[];
  loadingPropertyValues?: boolean;
}

// Operator categories and labels
const OPERATOR_OPTIONS = [
  { label: 'equals', value: 'equals' },
  { label: 'not equals', value: 'not_equals' },
  { label: 'contains', value: 'contains' },
  { label: 'not contains', value: 'not_contains' },
  { label: 'starts with', value: 'starts_with' },
  { label: 'ends with', value: 'ends_with' },
  { label: 'regex', value: 'regex' },
  { label: 'in (list)', value: 'in' },
  { label: 'not in (list)', value: 'not_in' },

  { label: '> greater than', value: 'greater_than' },
  { label: '< less than', value: 'less_than' },
  { label: '>= greater or equal', value: 'greater_than_or_equal' },
  { label: '<= less or equal', value: 'less_than_or_equal' },
  { label: 'between', value: 'between' },

  { label: 'is empty', value: 'is_empty' },
  { label: 'is not empty', value: 'is_not_empty' },
];

const FilterRow: React.FC<FilterRowProps> = ({
  filter,
  properties,
  onUpdate,
  onRemove,
  onPropertyChange,
  propertyValues = [],
  loadingPropertyValues = false,
}) => {
  const [localValue, setLocalValue] = useState(filter.value);
  const [localValue2, setLocalValue2] = useState(filter.value2 || '');

  // Sync local state with prop changes
  useEffect(() => {
    setLocalValue(filter.value);
    setLocalValue2(filter.value2 || '');
  }, [filter.value, filter.value2]);

  const handlePropertyChange = (property: string) => {
    onUpdate('property', property);
    if (onPropertyChange) {
      onPropertyChange(property);
    }
  };

  const handleOperatorChange = (operator: any) => {
    onUpdate('operator', operator);
    // Reset values when operator changes
    if (operator === 'is_empty' || operator === 'is_not_empty') {
      onUpdate('value', '');
      onUpdate('value2', undefined);
    }
  };

  const handleValueChange = (value: string) => {
    setLocalValue(value);
    onUpdate('value', value);
  };

  const handleValue2Change = (value: string) => {
    setLocalValue2(value);
    onUpdate('value2', value);
  };

  // Determine if operator needs value input
  const needsValue = filter.operator !== 'is_empty' && filter.operator !== 'is_not_empty';
  const needsValue2 = filter.operator === 'between';

  // Determine input type based on operator
  const isNumericOperator = [
    'greater_than',
    'less_than',
    'greater_than_or_equal',
    'less_than_or_equal',
    'between',
  ].includes(filter.operator);

  const isListOperator = filter.operator === 'in' || filter.operator === 'not_in';
  const isRegexOperator = filter.operator === 'regex';

  // Render value input based on operator
  const renderValueInput = () => {
    if (!needsValue) {
      return (
        <Input
          size="small"
          disabled
          placeholder="No value needed"
          style={{ width: '100%' }}
        />
      );
    }

    if (isNumericOperator) {
      return (
        <Space.Compact style={{ width: '100%' }}>
          <InputNumber
            size="small"
            style={{ width: needsValue2 ? '50%' : '100%' }}
            placeholder={needsValue2 ? 'Min value' : 'Value'}
            value={localValue ? parseFloat(localValue) : undefined}
            onChange={(val) => handleValueChange(val?.toString() || '')}
          />
          {needsValue2 && (
            <InputNumber
              size="small"
              style={{ width: '50%' }}
              placeholder="Max value"
              value={localValue2 ? parseFloat(localValue2) : undefined}
              onChange={(val) => handleValue2Change(val?.toString() || '')}
            />
          )}
        </Space.Compact>
      );
    }

    if (isListOperator) {
      return (
        <Select
          mode="tags"
          size="small"
          style={{ width: '100%' }}
          placeholder="Enter values (comma separated)"
          value={localValue ? localValue.split(',').map(v => v.trim()).filter(Boolean) : []}
          onChange={(values) => handleValueChange(values.join(','))}
          loading={loadingPropertyValues}
          tokenSeparators={[',']}
        >
          {propertyValues.map(val => (
            <Option key={val} value={val}>{val}</Option>
          ))}
        </Select>
      );
    }

    if (isRegexOperator) {
      return (
        <Tooltip title="Use ClickHouse regex syntax. Case-insensitive by default.">
          <Input
            size="small"
            style={{ width: '100%' }}
            placeholder="e.g., ^user_.*"
            value={localValue}
            onChange={(e) => handleValueChange(e.target.value)}
          />
        </Tooltip>
      );
    }

    // Default: AutoComplete with property values
    return (
      <AutoComplete
        size="small"
        style={{ width: '100%' }}
        placeholder="Enter or select value"
        value={localValue}
        onChange={handleValueChange}
        options={propertyValues.map(val => ({ value: val }))}
        filterOption={(input, option) =>
          (option?.value as string)?.toLowerCase().includes(input.toLowerCase())
        }
      />
    );
  };

  return (
    <Row gutter={8} align="middle" style={{ marginBottom: 8 }}>
      <Col span={7}>
        <Select
          showSearch
          size="small"
          style={{ width: '100%' }}
          placeholder="Select property"
          value={filter.property || undefined}
          onChange={handlePropertyChange}
          filterOption={(input, option) =>
                String(option?.children || '').toLowerCase().includes(input.toLowerCase())
          }
        >
          {properties.map(prop => (
            <Option key={prop} value={prop}>{prop}</Option>
          ))}
        </Select>
      </Col>
      <Col span={7}>
        <Select
          size="small"
          style={{ width: '100%' }}
          value={filter.operator}
          onChange={handleOperatorChange}
        >
          {OPERATOR_OPTIONS.map(opt => (
            <Option key={opt.value} value={opt.value}>
              {opt.label}
            </Option>
          ))}
        </Select>
      </Col>
      <Col span={9}>
        {renderValueInput()}
      </Col>
      <Col span={1}>
        <Button
          type="text"
          danger
          size="small"
          icon={<CloseOutlined />}
          onClick={onRemove}
        />
      </Col>
    </Row>
  );
};

export default FilterRow;
